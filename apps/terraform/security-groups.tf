resource "aws_security_group" "eks_cluster" {
  name        = "${local.name_prefix}-eks-cluster"
  description = "Network boundary for the future EKS control plane interfaces."
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-eks-cluster"
    Role = "eks-cluster"
  }
}

resource "aws_security_group" "eks_nodes" {
  name        = "${local.name_prefix}-eks-nodes"
  description = "Network boundary for private EKS worker nodes."
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-eks-nodes"
    Role = "eks-nodes"
  }
}

resource "aws_vpc_security_group_ingress_rule" "cluster_from_nodes_https" {
  security_group_id            = aws_security_group.eks_cluster.id
  referenced_security_group_id = aws_security_group.eks_nodes.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "Allow worker nodes to reach the Kubernetes API endpoint."
}

resource "aws_vpc_security_group_egress_rule" "cluster_to_nodes_https" {
  security_group_id            = aws_security_group.eks_cluster.id
  referenced_security_group_id = aws_security_group.eks_nodes.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "Allow the control plane to reach node HTTPS webhooks."
}

resource "aws_vpc_security_group_egress_rule" "cluster_to_nodes_kubelet" {
  security_group_id            = aws_security_group.eks_cluster.id
  referenced_security_group_id = aws_security_group.eks_nodes.id
  ip_protocol                  = "tcp"
  from_port                    = 10250
  to_port                      = 10250
  description                  = "Allow the control plane to reach kubelet on worker nodes."
}

resource "aws_vpc_security_group_ingress_rule" "nodes_from_cluster_https" {
  security_group_id            = aws_security_group.eks_nodes.id
  referenced_security_group_id = aws_security_group.eks_cluster.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "Allow control plane HTTPS traffic to worker nodes."
}

resource "aws_vpc_security_group_ingress_rule" "nodes_from_cluster_kubelet" {
  security_group_id            = aws_security_group.eks_nodes.id
  referenced_security_group_id = aws_security_group.eks_cluster.id
  ip_protocol                  = "tcp"
  from_port                    = 10250
  to_port                      = 10250
  description                  = "Allow control plane kubelet traffic to worker nodes."
}

resource "aws_vpc_security_group_ingress_rule" "nodes_from_self" {
  security_group_id            = aws_security_group.eks_nodes.id
  referenced_security_group_id = aws_security_group.eks_nodes.id
  ip_protocol                  = "-1"
  description                  = "Allow worker nodes and pods on nodes to communicate within the node group."
}

resource "aws_vpc_security_group_egress_rule" "nodes_to_internet" {
  security_group_id = aws_security_group.eks_nodes.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Allow private worker nodes to reach AWS APIs and package registries through NAT."
}
