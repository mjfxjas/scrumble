# Scrumble Terraform Infrastructure

Infrastructure as Code for Scrumble using Terraform.

## Structure

```
terraform/
├── main.tf              # Root module
├── variables.tf         # Input variables
├── outputs.tf           # Output values
├── modules/
│   ├── dynamodb/        # DynamoDB table module
│   ├── lambda/          # Lambda function module
│   └── monitoring/      # CloudWatch monitoring module
└── environments/
    ├── dev/             # Development environment
    └── prod/            # Production environment
```

## Prerequisites

- Terraform >= 1.0
- AWS CLI configured
- Admin API key (stored in environment variable or passed via CLI)

## Usage

### Initialize Terraform

```bash
cd terraform
terraform init
```

### Plan Deployment (Production)

```bash
terraform plan \
  -var-file="environments/prod/terraform.tfvars" \
  -var="admin_key=$ADMIN_KEY"
```

### Apply Deployment (Production)

```bash
terraform apply \
  -var-file="environments/prod/terraform.tfvars" \
  -var="admin_key=$ADMIN_KEY"
```

### Development Environment

```bash
terraform apply \
  -var-file="environments/dev/terraform.tfvars" \
  -var="admin_key=$ADMIN_KEY"
```

### Destroy Infrastructure

```bash
terraform destroy \
  -var-file="environments/prod/terraform.tfvars" \
  -var="admin_key=$ADMIN_KEY"
```

## Modules

### DynamoDB Module
Creates DynamoDB table with provisioned capacity for cost optimization.

### Lambda Module
- Creates Lambda function with Function URL
- Configures IAM role and policies
- Sets reserved concurrent executions for cost control
- Packages backend code automatically

### Monitoring Module (Optional)
- CloudWatch alarms for errors, duration, throttles
- SNS topic for alerts
- CloudWatch dashboard for ops metrics
- Email notifications (optional)

## Outputs

After deployment, Terraform outputs:
- `function_url` - Lambda Function URL endpoint
- `table_name` - DynamoDB table name
- `monitoring_dashboard_url` - CloudWatch dashboard URL (if monitoring enabled)

## Cost Optimization

This infrastructure implements several cost optimizations:
- **Provisioned DynamoDB capacity** (5 RCU/5 WCU) vs on-demand
- **Reserved Lambda concurrency** (10) to prevent runaway costs
- **ARM64 architecture** for Lambda (20% cost savings)
- **Monitoring alarms** to catch cost spikes early

## Comparison with SAM

This Terraform configuration is equivalent to `template.yaml` (AWS SAM) but offers:
- **Multi-cloud potential** (can extend to Azure/GCP)
- **Modular design** (reusable modules)
- **Environment management** (dev/prod configs)
- **State management** (Terraform state tracking)
- **Plan before apply** (preview changes)

## Migration from SAM

To migrate from existing SAM deployment:
1. Import existing resources: `terraform import`
2. Verify plan matches existing infrastructure
3. Apply to take over management
4. Optionally delete SAM stack

## Backend Configuration

For team collaboration, configure remote state:

```hcl
terraform {
  backend "s3" {
    bucket = "scrumble-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
  }
}
```
