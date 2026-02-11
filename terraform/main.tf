terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "dynamodb" {
  source = "./modules/dynamodb"
  
  table_name            = var.table_name
  read_capacity_units   = var.read_capacity_units
  write_capacity_units  = var.write_capacity_units
  environment           = var.environment
}

module "lambda" {
  source = "./modules/lambda"
  
  function_name             = var.function_name
  table_name                = module.dynamodb.table_name
  table_arn                 = module.dynamodb.table_arn
  admin_key                 = var.admin_key
  reserved_concurrent_executions = var.reserved_concurrent_executions
  environment               = var.environment
}

module "monitoring" {
  source = "./modules/monitoring"
  count  = var.enable_monitoring ? 1 : 0
  
  function_name = module.lambda.function_name
  table_name    = module.dynamodb.table_name
  alarm_email   = var.alarm_email
  environment   = var.environment
}
