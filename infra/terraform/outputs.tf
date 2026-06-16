# ============================================================================
# Outputs for the TryIt self-host AWS skeleton.
# ============================================================================

output "cluster_name" {
  description = "Name of the ECS cluster running the TryIt stack."
  value       = aws_ecs_cluster.this.name
}

output "api_alb_dns_name" {
  description = "Public DNS name of the API load balancer. Point your domain's CNAME here."
  value       = aws_lb.api.dns_name
}

output "api_target_group_arn" {
  description = "ARN of the API target group (attach the ECS API service to this)."
  value       = aws_lb_target_group.api.arn
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint. Feed into the API as REDIS_URL=redis://<endpoint>:6379."
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "tasks_security_group_id" {
  description = "Security group ID to attach to the Fargate API + inference services."
  value       = aws_security_group.tasks.id
}
