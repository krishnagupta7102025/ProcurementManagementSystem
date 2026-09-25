# Uses the account's default VPC to keep this stack simple to stand up —
# fine for a first production deployment of this size. Revisit (dedicated
# VPC, private subnets for RDS, NAT gateway) once real traffic/compliance
# needs justify the added complexity and cost.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "eb" {
  name        = "${var.project}-eb-${var.environment}"
  description = "Elastic Beanstalk API environment"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project = var.project
  }
}

resource "aws_security_group_rule" "eb_http_in" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.eb.id
}

resource "aws_security_group" "rds" {
  name        = "${var.project}-rds-${var.environment}"
  description = "RDS MySQL — only reachable from the API's EB instances"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project = var.project
  }
}

resource "aws_security_group_rule" "rds_from_eb" {
  type                     = "ingress"
  from_port                = 3306
  to_port                  = 3306
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.eb.id
  security_group_id        = aws_security_group.rds.id
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.project}-${var.environment}"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Project = var.project
  }
}
