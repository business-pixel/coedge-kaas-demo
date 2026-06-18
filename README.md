# CoEdge KaaS Demo App Test

A minimal Node.js server to test **load balancing** and **HPA (autoscaling)** on CoEdge's shared namespace Kubernetes offering.

---

## What This Does

The server exposes three endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /` | Returns pod name, namespace, node — proves which pod served the request |
| `GET /health` | Liveness/readiness probe — K8s uses this to check pod health |
| `GET /load?ms=2000` | Burns CPU for N milliseconds — triggers HPA to scale up |

---

## Repo Structure

```
coedge-kaas-demo/
├── app/
│   ├── server.js       ← Node.js server (zero dependencies)
│   ├── package.json
│   └── Dockerfile
└── k8s/
    ├── deployment.yaml ← 2 replicas, pod identity env vars
    ├── service.yaml    ← ClusterIP service
    ├── ingress.yaml    ← nginx ingress routing by hostname
    └── hpa.yaml        ← scales 2→10 pods at 30% CPU
```

---

## Step 1 — Build and Push Docker Image

You need a public Docker Hub account (free).

```bash
# Build
docker build -t <your-dockerhub-username>/coedge-kaas-demo:latest ./app

# Push
docker push <your-dockerhub-username>/coedge-kaas-demo:latest
```

Then update `k8s/deployment.yaml` — replace the image line:
```yaml
# Change this:
image: nginx:alpine   # placeholder

# To this:
image: <your-dockerhub-username>/coedge-kaas-demo:latest
```

Commit and push to Bitbucket.

---

## Step 2 — Deploy via ArgoCD

1. Open ArgoCD at `http://43.242.226.225:32167`
2. Login with your customer credentials
3. Click **New App**
4. Fill in:
   - **Application Name:** `demo-app`
   - **Project:** `customer-acmecorp`
   - **Sync Policy:** Automatic
   - **Repository URL:** your Bitbucket repo URL
   - **Path:** `k8s/`
   - **Cluster URL:** `https://kubernetes.default.svc`
   - **Namespace:** `customer-acmecorp`
5. Click **Create**

ArgoCD will deploy all 4 manifests automatically.

---

## Step 3 — Test Load Balancing

Hit the root endpoint multiple times — you should see different pod names:

```bash
# Run 10 requests and see which pods serve them
for i in $(seq 1 10); do
  curl -s -H "Host: acmecorp.k8s.coedge.cloud" http://43.242.226.225/ | grep pod
done
```

Expected output — alternating pod names:
```json
{ "pod": "demo-app-656b585f6d-abc12" }
{ "pod": "demo-app-656b585f6d-xyz99" }
{ "pod": "demo-app-656b585f6d-abc12" }
{ "pod": "demo-app-656b585f6d-xyz99" }
```

If DNS is set up (`acmecorp.k8s.coedge.cloud → 43.242.226.225`):
```bash
for i in $(seq 1 10); do
  curl -s http://acmecorp.k8s.coedge.cloud/ | python3 -m json.tool | grep pod
done
```

---

## Step 4 — Test HPA (Autoscaling)

### Terminal 1 — Watch HPA scale up
```bash
kubectl --kubeconfig ~/kubeconfig-coedge-k8s \
  get hpa demo-app-hpa -n customer-acmecorp -w
```

### Terminal 2 — Generate CPU load
```bash
# Hit the /load endpoint 50 times in parallel
for i in $(seq 1 50); do
  curl -s -H "Host: acmecorp.k8s.coedge.cloud" \
    "http://43.242.226.225/load?ms=3000" &
done
wait
```

### What to Expect

```
NAME           REFERENCE             TARGETS   MINPODS   MAXPODS   REPLICAS
demo-app-hpa   Deployment/demo-app   5%/30%    2         10        2        ← idle
demo-app-hpa   Deployment/demo-app   78%/30%   2         10        2        ← load hit
demo-app-hpa   Deployment/demo-app   78%/30%   2         10        4        ← scaling up
demo-app-hpa   Deployment/demo-app   45%/30%   2         10        6        ← more pods
demo-app-hpa   Deployment/demo-app   22%/30%   2         10        6        ← stable
```

After load stops — HPA scales back down to 2 after ~2 minutes.

---

## Step 5 — Watch in Headlamp

Open `http://k8s.coedge.cloud:30118`, navigate to:
- **Workloads → Pods** — watch new pods appear during scale-up
- **Workloads → HPA** — see current CPU % and replica count
- **Workloads → Deployments** — see replica count change in real time

---

## Troubleshooting

**Pods not starting:**
```bash
kubectl --kubeconfig ~/kubeconfig-coedge-k8s \
  describe pod -n customer-acmecorp -l app=demo-app
```

**Ingress not routing:**
```bash
# Test with explicit Host header
curl -v -H "Host: acmecorp.k8s.coedge.cloud" http://43.242.226.225/
```

**HPA shows `<unknown>` for CPU:**
```bash
# Metrics server must be running
kubectl --kubeconfig ~/kubeconfig-coedge-k8s \
  top pods -n customer-acmecorp
```

**Image pull failing:**
- Make sure Docker Hub image is public
- Or add imagePullSecrets to deployment.yaml for private repos
