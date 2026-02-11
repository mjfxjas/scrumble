variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
}

variable "table_name" {
  description = "DynamoDB table name"
  type        = string
  default     = "scrumble-data"
}

variable "function_name" {
  description = "Lambda function name"
  type        = string
  default     = "scrumble-function"
}

variable "read_capacity_units" {
  description = "DynamoDB read capacity units"
  type        = number
  default     = 5
}

variable "write_capacity_units" {
  description = "DynamoDB write capacity units"
  type        = number
  default     = 5
}

variable "reserved_concurrent_executions" {
  description = "Lambda reserved concurrent executions"
  type        = number
  default     = 10
}

variable "admin_key" {
  description = "Admin API key"
  type        = string
  sensitive   = true
}

variable "enable_monitoring" {
  description = "Enable CloudWatch monitoring and alarms"
  type        = bool
  default     = false
}

variable "alarm_email" {
  description = "Email for CloudWatch alarms"
  type        = string
  default     = ""
}
