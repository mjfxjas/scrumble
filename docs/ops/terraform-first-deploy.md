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
4. For `prod`, follow the migration step below before first `apply`

## 4a) Prod migration (existing SAM stack)

If prod resources already exist from SAM/CloudFormation, import them into Terraform state before first prod apply.

1. Set `terraform/environments/prod/terraform.tfvars` `function_name` to the real physical Lambda name.
2. Initialize prod backend and export admin key for non-interactive runs:

```bash
export TF_VAR_admin_key="$ADMIN_KEY"

terraform -chdir=terraform init -reconfigure \
  -backend-config="bucket=<TF_STATE_BUCKET>" \
  -backend-config="key=scrumble/prod/terraform.tfstate" \
  -backend-config="region=<AWS_REGION>" \
  -backend-config="dynamodb_table=<TF_STATE_LOCK_TABLE>" \
  -backend-config="encrypt=true"
```

3. Import existing resources:

```bash
terraform -chdir=terraform import -var-file="environments/prod/terraform.tfvars" \
  module.dynamodb.aws_dynamodb_table.scrumble <prod-table-name>

terraform -chdir=terraform import -var-file="environments/prod/terraform.tfvars" \
  module.lambda.aws_lambda_function.scrumble <prod-lambda-function-name>
```

4. Run prod plan in CI (`environment=prod`, `action=plan`) and apply once clean.

Known current prod mapping:
- Table: `scrumble-data`
- Lambda: `sam-app-ScrumbleFunction-D5sPLYeqku97`

## 5) Post-deploy validation

- Confirm Lambda URL responds to `/health`
- Confirm DynamoDB table exists and has expected capacity
- Confirm alarms/dashboard exist if monitoring enabled

## Safety notes

- Use `plan` before every `apply`
- Restrict `destroy` usage to controlled windows
- Keep state bucket versioning enabled
