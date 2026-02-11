output "terraform_deploy_role_arn" {
  description = "OIDC deploy role ARN for GitHub Actions Terraform workflow"
  value       = aws_iam_role.terraform_deploy.arn
}
