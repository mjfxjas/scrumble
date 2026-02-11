# Terraform First Deploy Path

This runbook provides a safe first deploy path for Scrumble using Terraform with remote state and GitHub OIDC.

## 1) Bootstrap remote state (one time)

Create an S3 bucket and DynamoDB lock table for Terraform state.

Required values:
- `TF_STATE_BUCKET`
- `TF_STATE_LOCK_TABLE`
- `AWS_REGION`

Use examples:
- `terraform/environments/dev/backend.hcl.example`
- `terraform/environments/prod/backend.hcl.example`

## 2) Bootstrap GitHub OIDC deploy role (one time)

```bash
cd terraform/bootstrap/oidc
terraform init
terraform apply \
  -var "github_owner=mjfxjas" \
  -var "github_repo=scrumble" \
  -var "tf_state_bucket=<state-bucket>" \
  -var "tf_lock_table=<lock-table>"
```

Capture output `terraform_deploy_role_arn`.

## 3) Configure GitHub secrets

Set the following repo secrets:
- `TERRAFORM_DEPLOY_ROLE_ARN`
- `TF_STATE_BUCKET`
- `TF_STATE_LOCK_TABLE`
- `AWS_REGION`
- `ADMIN_KEY`

## 4) First deploy (plan then apply)

Use workflow: `.github/workflows/terraform-infra.yml`

1. Dispatch with `environment=dev`, `action=plan`
2. Review output
3. Dispatch with `environment=dev`, `action=apply`
4. Repeat for `prod`

## 5) Post-deploy validation

- Confirm Lambda URL responds to `/health`
- Confirm DynamoDB table exists and has expected capacity
- Confirm alarms/dashboard exist if monitoring enabled

## Safety notes

- Use `plan` before every `apply`
- Restrict `destroy` usage to controlled windows
- Keep state bucket versioning enabled
