resource "aws_dynamodb_table" "scrumble" {
  name           = var.table_name
  billing_mode   = "PROVISIONED"
  read_capacity  = var.read_capacity_units
  write_capacity = var.write_capacity_units
  hash_key       = "pk"
  range_key      = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Name        = var.table_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

variable "table_name" {
  description = "DynamoDB table name"
  type        = string
}

variable "read_capacity_units" {
  description = "Read capacity units"
  type        = number
}

variable "write_capacity_units" {
  description = "Write capacity units"
  type        = number
}

variable "environment" {
  description = "Environment name"
  type        = string
}

output "table_name" {
  value = aws_dynamodb_table.scrumble.name
}

output "table_arn" {
  value = aws_dynamodb_table.scrumble.arn
}
