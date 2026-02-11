# Terraform OIDC Bootstrap

This bootstrap module creates a least-privilege IAM role for GitHub Actions to run Terraform against Scrumble infrastructure.

## What It Creates
- IAM role trusted by GitHub OIDC (`token.actions.githubusercontent.com`)
- Inline least-privilege policy for:
  - Terraform remote state bucket + lock table access
  - Scrumble infra resources (DynamoDB/Lambda/IAM/SNS/CloudWatch)

## Usage

```bash
cd terraform/bootstrap/oidc
terraform init
terraform apply \
  -var "github_owner=mjfxjas" \
  -var "github_repo=scrumble" \
  -var "tf_state_bucket=<your-state-bucket>" \
  -var "tf_lock_table=<your-lock-table>"
```

After apply, capture `terraform_deploy_role_arn` and set it as GitHub Actions secret:
- `TERRAFORM_DEPLOY_ROLE_ARN`

## Notes
- This module is intended as a one-time bootstrap for CI auth.
- Adjust the trust policy conditions if you deploy from additional branches/environments.
