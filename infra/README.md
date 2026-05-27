Infrastructure for KisanDirect

Overview
- AWS region: ap-south-1 (Mumbai) — NO cross-region resources or data flow.
- IaC: Terraform
- Orchestration: EKS (Kubernetes 1.29+)
- GitOps: ArgoCD
- API Gateway: Kong on EKS
- Service mesh: Istio
- Monitoring: Prometheus, Grafana, Loki, Jaeger
- CDN: CloudFront (ap-south-1 edge)
- ALB + WAF for ingress protection

Security & Constraints
- All secrets must live in AWS Secrets Manager. Do NOT store secrets in repo, env files, or images.
- Images: Node 20 LTS on Alpine. Keep image sizes minimal for 2G targets.
- Zero-downtime deployments via rolling updates / Istio traffic shifting + ArgoCD

Layout
- terraform/: Root Terraform config and modules
- k8s/: Kubernetes manifests and Helm values for ArgoCD, Istio, Kong, monitoring
- ci/: GitHub Actions workflows (build & push, ArgoCD sync)

Next steps
1. Initialize Terraform with S3 backend (provided).  Configure AWS creds using OIDC or a short-lived role.
2. Populate variables in a local, gitignored terraform.tfvars.
3. Plan & apply modules in order: vpc -> iam -> ecr -> eks -> alb/waf/cloudfront -> k8s add-ons.
