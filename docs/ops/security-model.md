# Security Model (Terraform + CI)

## Authentication
- GitHub Actions authenticates to AWS via OIDC (`sts:AssumeRoleWithWebIdentity`).
- No long-lived AWS access keys are required for infra deploy jobs.

## Authorization
- Deploy role is scoped to:
  - Terraform state backend (`S3` + lock `DynamoDB`)
  - Scrumble-managed resources (`DynamoDB`, `Lambda`, `IAM`, `SNS`, `CloudWatch`)
- Trust policy restricts subject to this repository and allowed refs/environments.

## Secrets
- `ADMIN_KEY` remains in GitHub Secrets and is provided as `TF_VAR_admin_key`.
- Terraform state should remain encrypted and access-controlled.

## Operational safeguards
- Manual `workflow_dispatch` for infra changes
- `plan` then `apply` flow
- Remote state locking to avoid concurrent apply corruption
- Runbooks for rollback and incident response
