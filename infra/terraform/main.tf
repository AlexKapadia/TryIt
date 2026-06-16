# ============================================================================
# TryIt self-host — AWS ECS/Fargate + ALB + ElastiCache Redis SKELETON.
#
# This is a STARTING POINT, not a production module. It mirrors the
# infra/docker-compose.yml topology onto AWS so a retailer can see how the
# self-host stack maps to cloud primitives:
#
#   compose `api`        -> ECS service behind an internet-facing ALB
#   compose `inference`  -> ECS service, private, reached in-VPC by the API
#   compose `redis`      -> ElastiCache for Redis (replaces the redis container)
#   compose network      -> VPC + security groups
#
# Several resources are intentionally left as commented stubs / TODOs so you
# adapt them to your own networking, logging, and IAM standards before applying.
# Nothing here should be `terraform apply`-d without review.
# ============================================================================

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

locals {
  name = "${var.project}-${var.environment}"
  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Component   = "tryit-self-host"
  }
}

# --- ECS cluster ------------------------------------------------------------
resource "aws_ecs_cluster" "this" {
  name = local.name
  tags = local.tags
}

# --- Security groups --------------------------------------------------------
# ALB accepts public HTTPS; tasks accept traffic only from the ALB / each other;
# Redis accepts traffic only from the API tasks. Deny-by-default everywhere.
resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public HTTPS into the API ALB."
  vpc_id      = var.vpc_id
  ingress {
    description = "HTTPS from the internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

resource "aws_security_group" "tasks" {
  name        = "${local.name}-tasks"
  description = "Fargate tasks: API (from ALB) and inference (from API)."
  vpc_id      = var.vpc_id
  ingress {
    description     = "API port from ALB"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  ingress {
    description = "Inference port from within the task group (API -> inference)"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    self        = true
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

resource "aws_security_group" "redis" {
  name        = "${local.name}-redis"
  description = "ElastiCache Redis, reachable only from API tasks."
  vpc_id      = var.vpc_id
  ingress {
    description     = "Redis from API tasks"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.tasks.id]
  }
  tags = local.tags
}

# --- ElastiCache Redis (rate-limit / cache backing) -------------------------
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name}-redis"
  subnet_ids = var.private_subnet_ids
  tags       = local.tags
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${local.name}-redis"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
  # TODO: enable transit_encryption_enabled + at_rest_encryption_enabled and an
  # AUTH token (sourced from Secrets Manager) before any production use.
  tags = local.tags
}

# --- Application Load Balancer (public entrypoint) --------------------------
resource "aws_lb" "api" {
  name               = "${local.name}-api"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
  tags               = local.tags
}

resource "aws_lb_target_group" "api" {
  name        = "${local.name}-api"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  health_check {
    path                = "/v1/health" # matches the container HEALTHCHECK
    matcher             = "200"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  tags = local.tags
}

# HTTPS listener. Supply an ACM cert ARN for your domain; HTTP->HTTPS redirect
# is left as a TODO so you wire it to your own DNS/cert setup.
# resource "aws_lb_listener" "https" {
#   load_balancer_arn = aws_lb.api.arn
#   port              = 443
#   protocol          = "HTTPS"
#   certificate_arn   = "<ACM_CERT_ARN>"          # TODO
#   ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
#   default_action {
#     type             = "forward"
#     target_group_arn = aws_lb_target_group.api.arn
#   }
# }

# ============================================================================
# ECS task definitions + services — STUBS.
#
# These are left as commented stubs because they depend on your IAM execution
# role, CloudWatch log group, and (for the API) the FAL_KEY secret injection.
# Fill them in against the references above. Key points to preserve:
#   * API container: port 3001, env TRYIT_INFERENCE_URL=http://<inference>:8000,
#     REDIS_URL=redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379,
#     NODE_ENV=production, TRYIT_DEV_DEMO=0, FAL_KEY via `secrets` (NOT plaintext).
#   * Inference container: port 8000, TRYIT_INFER_BACKEND=mock (or a GPU image).
#   * Run as non-root (the images already define unprivileged users).
# ============================================================================

# resource "aws_ecs_task_definition" "api"       { ... }   # TODO
# resource "aws_ecs_service"         "api"       { ... }   # TODO (wire ALB target group)
# resource "aws_ecs_task_definition" "inference" { ... }   # TODO
# resource "aws_ecs_service"         "inference" { ... }   # TODO (service discovery for API->inference)
