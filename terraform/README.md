# Scrumble Terraform Infrastructure

Infrastructure as Code for Scrumble using Terraform.

## Flagship Ops Layout

```
terraform/
├── main.tf
├── variables.tf
├── outputs.tf
├── modules/
│   ├── dynamodb/
│   ├── lambda/
│   └── monitoring/
├── environments/
│   ├── dev/
│   │   ├── terraform.tfvars
│   │   └── backend.hcl.example
│   └── prod/
│       ├── terraform.tfvars
│       └── backend.hcl.example
└── bootstrap/
    └── oidc/
        ├── main.tf
        ├── variables.tf
        ├── outputs.tf
        └── README.md
```

## Requirements

- Terraform >= 1.5
- AWS CLI configured
- GitHub repo secrets configured for workflow deploy path

## Environment Separation

Environment-specific settings are split by tfvars:
- `environments/dev/terraform.tfvars`
- `environments/prod/terraform.tfvars`

Run with environment-specific vars:

```bash
terraform -chdir=terraform plan -var-file="environments/dev/terraform.tfvars"
terraform -chdir=terraform plan -var-file="environments/prod/terraform.tfvars"
```

## Remote State Backend

Examples for backend config are provided:
- `environments/dev/backend.hcl.example`
- `environments/prod/backend.hcl.example`

Use `terraform init` with backend config values (or the CI workflow):

```bash
terraform -chdir=terraform init \
  -backend-config="bucket=<TF_STATE_BUCKET>" \
  -backend-config="key=scrumble/dev/terraform.tfstate" \
  -backend-config="region=<AWS_REGION>" \
  -backend-config="dynamodb_table=<TF_STATE_LOCK_TABLE>" \
  -backend-config="encrypt=true"
```

## Least-Privilege IAM + OIDC Auth

Bootstrap module for GitHub OIDC deploy role:
- `bootstrap/oidc/`

It creates a role with:
- GitHub OIDC trust policy (`token.actions.githubusercontent.com`)
- Least-privilege policy scoped for state backend + Scrumble infra resources

## Monitoring + Dashboard

Optional monitoring module (`enable_monitoring=true`) creates:
- SNS topic/subscription for ops alerts
- CloudWatch alarms (errors, p95 duration, throttles)
- CloudWatch dashboard

## CI Deploy Path

Workflow: `.github/workflows/terraform-infra.yml`

Manual dispatch inputs:
- `environment`: `dev` or `prod`
- `action`: `plan`, `apply`, `destroy`

Required secrets:
- `TERRAFORM_DEPLOY_ROLE_ARN`
- `TF_STATE_BUCKET`
- `TF_STATE_LOCK_TABLE`
- `AWS_REGION`
- `ADMIN_KEY`

## Rollback

See rollback runbook:
- `runbooks/rollback-terraform.md`

First deploy instructions:
- `docs/ops/terraform-first-deploy.md`
