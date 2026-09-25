resource "random_password" "db" {
  length  = 32
  special = false # avoids characters MySQL connection URLs need percent-encoded
}

resource "aws_db_instance" "this" {
  identifier     = "${var.project}-${var.environment}"
  engine         = "mysql"
  engine_version = "8.0"

  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage_gb
  storage_type          = "gp3"
  db_name               = var.db_name
  username              = var.db_username
  password              = random_password.db.result
  port                  = 3306
  multi_az              = var.db_multi_az
  db_subnet_group_name  = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # Demo/early-production defaults — revisit once this holds real data.
  backup_retention_period = 7
  skip_final_snapshot     = true
  deletion_protection     = false
  publicly_accessible     = false
  apply_immediately       = true

  tags = {
    Project = var.project
  }
}
