# ============================================================================
# Input variables for the TryIt self-host AWS skeleton.
# SKELETON — review and harden every default before any real deployment.
# ============================================================================

variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Name prefix applied to all created resources."
  type        = string
  default     = "tryit"
}

variable "environment" {
  description = "Deployment environment (e.g. dev, staging, prod)."
  type        = string
  default     = "prod"
}

# --- Networking -------------------------------------------------------------
# This skeleton ASSUMES a pre-existing VPC with public+private subnets. Wire
# these to your network module / data sources rather than hard-coding IDs.
variable "vpc_id" {
  description = "ID of the VPC the stack runs in."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets for the internet-facing ALB."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnets for Fargate tasks and ElastiCache."
  type        = list(string)
}

# --- Container images -------------------------------------------------------
# Push the images built from the Dockerfiles in this repo to a registry (ECR)
# and reference them here. Pin to immutable digests in production, not :latest.
variable "api_image" {
  description = "Fully-qualified image ref for @tryit/api (e.g. <acct>.dkr.ecr.<region>.amazonaws.com/tryit-api@sha256:...)."
  type        = string
}

variable "inference_image" {
  description = "Fully-qualified image ref for the inference service."
  type        = string
}

# --- Sizing -----------------------------------------------------------------
variable "api_desired_count" {
  description = "Number of API tasks (horizontal scaling — the API is stateless)."
  type        = number
  default     = 2
}

variable "inference_desired_count" {
  description = "Number of inference tasks. For the mock backend, scale freely; GPU backends need GPU-capable capacity."
  type        = number
  default     = 1
}

variable "api_cpu" {
  description = "Fargate CPU units for an API task."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate memory (MiB) for an API task."
  type        = number
  default     = 1024
}

# --- Secrets ----------------------------------------------------------------
# Provide the ARN of a Secrets Manager secret holding FAL_KEY (and any other
# secrets). The task definition should inject it via `secrets`, NOT `environment`.
variable "fal_key_secret_arn" {
  description = "Secrets Manager ARN for FAL_KEY. Leave empty to run self-host-only."
  type        = string
  default     = ""
}

# --- Redis ------------------------------------------------------------------
variable "redis_node_type" {
  description = "ElastiCache node type for the rate-limit/cache Redis."
  type        = string
  default     = "cache.t4g.micro"
}
