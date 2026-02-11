# Terraform Rollback Runbook

## Goal
Restore Scrumble infrastructure to a previous known-good state.

## Triggers
- Failed deploy with service degradation
- Unexpected resource drift causing production impact
- Misconfiguration introduced during apply

## Rollback strategy
1. Identify last known-good commit SHA for Terraform configuration.
2. Check out that commit locally or in a hotfix branch.
3. Run `terraform plan` against the affected environment.
4. If plan matches expected rollback changes, run `terraform apply`.

## Commands

```bash
cd terraform
terraform init \
  -backend-config="bucket=<TF_STATE_BUCKET>" \
  -backend-config="key=scrumble/prod/terraform.tfstate" \
  -backend-config="region=<AWS_REGION>" \
  -backend-config="dynamodb_table=<TF_STATE_LOCK_TABLE>" \
  -backend-config="encrypt=true"

terraform plan -var-file="environments/prod/terraform.tfvars" -var="admin_key=$ADMIN_KEY"
terraform apply -var-file="environments/prod/terraform.tfvars" -var="admin_key=$ADMIN_KEY"
```

## Emergency fallback
If Terraform rollback is blocked, use SAM deploy path to restore backend:
- `.github/workflows/deploy.yml` with known-good ref and parameters.

## Verification checklist
- `/health` endpoint returns 200
- Lambda errors/throttles normalize
- Vote and submit flows succeed
- CloudWatch alarms stop firing

## Post-incident
- Capture timeline and root cause
- Add regression guard (validation/tests/alarm threshold updates)
- Update this runbook if process gaps were found
