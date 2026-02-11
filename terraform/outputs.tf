output "function_url" {
  description = "Lambda Function URL"
  value       = module.lambda.function_url
}

output "table_name" {
  description = "DynamoDB table name"
  value       = module.dynamodb.table_name
}

output "table_arn" {
  description = "DynamoDB table ARN"
  value       = module.dynamodb.table_arn
}

output "function_arn" {
  description = "Lambda function ARN"
  value       = module.lambda.function_arn
}

output "monitoring_dashboard_url" {
  description = "CloudWatch dashboard URL"
  value       = var.enable_monitoring ? module.monitoring[0].dashboard_url : null
}
