variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "github_owner" {
  description = "GitHub org/user that owns the repository"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}

variable "role_name" {
  description = "IAM role name for Terraform deploys"
  type        = string
  default     = "scrumble-github-oidc-terraform-deploy"
}

variable "tf_state_bucket" {
  description = "S3 bucket used for Terraform remote state"
  type        = string
}

variable "tf_lock_table" {
  description = "DynamoDB lock table used by Terraform state backend"
  type        = string
}
