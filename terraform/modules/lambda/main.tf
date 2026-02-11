data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.root}/../backend"
  output_path = "${path.module}/lambda.zip"
}

resource "aws_iam_role" "lambda" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.function_name}-dynamodb"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          var.table_arn,
          "arn:aws:dynamodb:*:*:table/scrumble-comments"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "scrumble" {
  filename         = data.archive_file.lambda.output_path
  function_name    = var.function_name
  role            = aws_iam_role.lambda.arn
  handler         = "app.handler"
  source_code_hash = data.archive_file.lambda.output_base64sha256
  runtime         = "python3.12"
  timeout         = 10
  architectures   = ["arm64"]
  
  reserved_concurrent_executions = var.reserved_concurrent_executions

  environment {
    variables = {
      TABLE_NAME = var.table_name
      ADMIN_KEY  = var.admin_key
    }
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_lambda_function_url" "scrumble" {
  function_name      = aws_lambda_function.scrumble.function_name
  authorization_type = "NONE"
}

variable "function_name" {
  description = "Lambda function name"
  type        = string
}

variable "table_name" {
  description = "DynamoDB table name"
  type        = string
}

variable "table_arn" {
  description = "DynamoDB table ARN"
  type        = string
}

variable "admin_key" {
  description = "Admin API key"
  type        = string
  sensitive   = true
}

variable "reserved_concurrent_executions" {
  description = "Reserved concurrent executions"
  type        = number
}

variable "environment" {
  description = "Environment name"
  type        = string
}

output "function_name" {
  value = aws_lambda_function.scrumble.function_name
}

output "function_arn" {
  value = aws_lambda_function.scrumble.arn
}

output "function_url" {
  value = aws_lambda_function_url.scrumble.function_url
}
