# TryIt self-host — Terraform (AWS skeleton)

> **This is a SKELETON / starting point, not a turnkey production module.**
> It shows how the [`docker-compose.yml`](../docker-compose.yml) stack maps onto
> AWS primitives. Review, harden, and complete the stubbed task definitions
> before any real `terraform apply`.

## What it maps

| Compose service | AWS resource (here) |
| --- | --- |
| `api` (Next.js, 3001) | ECS/Fargate service behind an internet-facing **ALB** |
| `inference` (FastAPI, 8000) | ECS/Fargate service, private, reached in-VPC by the API |
| `redis` | **ElastiCache for Redis** (managed; replaces the container) |
| compose network | VPC + scoped **security groups** (deny-by-default) |

## What is provided vs. left to you

**Provided:** ECS cluster, ALB + target group (health-checked on `/v1/health`),
ElastiCache Redis + subnet group, and three scoped security groups (ALB ⇒ API
⇒ inference, API ⇒ Redis).

**Left as stubs / TODO (intentional):**
- The two **ECS task definitions + services** (`main.tf`, bottom) — they depend
  on your IAM execution role, CloudWatch log group, and secret injection.
- The **HTTPS listener** — supply your own ACM certificate ARN.
- **Redis encryption + AUTH token**, transit/at-rest encryption.
- A pre-existing **VPC** with public + private subnets (passed in as variables).

## Prerequisites

1. Build and push the images (from the repo Dockerfiles) to ECR:
   - `apps/api/Dockerfile` ⇒ `tryit-api`
   - `services/inference-py/Dockerfile` ⇒ `tryit-inference`
2. An existing VPC with public + private subnets.
3. (Optional) A Secrets Manager secret holding `FAL_KEY`.

## Usage

```bash
cd infra/terraform
terraform init

terraform plan \
  -var="vpc_id=vpc-xxxx" \
  -var='public_subnet_ids=["subnet-aaa","subnet-bbb"]' \
  -var='private_subnet_ids=["subnet-ccc","subnet-ddd"]' \
  -var="api_image=<acct>.dkr.ecr.<region>.amazonaws.com/tryit-api@sha256:..." \
  -var="inference_image=<acct>.dkr.ecr.<region>.amazonaws.com/tryit-inference@sha256:..."
```

Use a `terraform.tfvars` file (git-ignored) for these instead of long CLI flags.

## Security notes

- Inject `FAL_KEY` via the ECS task's `secrets` block (Secrets Manager) — **never**
  as a plaintext `environment` value.
- Keep `NODE_ENV=production` and `TRYIT_DEV_DEMO=0` so the dev credential
  endpoint is disabled.
- Pin images to **immutable digests**, not `:latest`.
- Enable Redis transit + at-rest encryption and an AUTH token before production.
- The container images already run as **non-root**; do not override that.
