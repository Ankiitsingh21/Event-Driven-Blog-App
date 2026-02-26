# Mini Microservices Blog

A full-stack blog application built with a microservices architecture. Users can create posts, add comments, and comments are automatically moderated. The entire system runs on Kubernetes with an NGINX Ingress Controller and is orchestrated using Skaffold for local development.

## Architecture

```
                                    +------------------+
                                    |   React Client   |
                                    |   (Port 3000)    |
                                    +--------+---------+
                                             |
                                     NGINX Ingress (posts.com)
                                             |
                    +------------+-----------+-----------+------------+
                    |            |                       |            |
             POST /posts/    GET /posts           POST /posts/    (events)
               create                              :id/comments
                    |            |                       |            |
            +-------+--+  +-----+------+  +-------------+-+  +------+------+
            |  Posts   |  |   Query    |  |   Comments    |  |  Event Bus  |
            |  :4000   |  |   :4002    |  |   :4001       |  |   :4005     |
            +-------+--+  +-----+------+  +-------+-------+  +------+------+
                    |            |                  |                 |
                    +------------+--------+---------+-----------------+
                                          |
                                  +-------+--------+
                                  |   Moderation   |
                                  |   :4003        |
                                  +----------------+
```

### Event Flow

```
1. User creates a post
   Client --> Posts Service --[PostCreated]--> Event Bus --> Query Service (stores)

2. User adds a comment
   Client --> Comments Service --[CommentCreated]--> Event Bus
     --> Moderation Service (approves/rejects)
     --> Query Service (stores with 'pending' status)

3. Moderation processes comment
   Moderation --[CommentModerated]--> Event Bus
     --> Comments Service (updates status, emits CommentUpdated)
     --> Query Service (updates status to 'approved' or 'rejected')
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| **Posts** | 4000 | Creates blog posts. Emits `PostCreated` events. |
| **Comments** | 4001 | Creates comments on posts. Handles moderation results. Emits `CommentCreated` and `CommentUpdated` events. |
| **Query** | 4002 | Denormalized read model. Aggregates posts and comments for efficient reads. Replays events on startup for resilience. |
| **Moderation** | 4003 | Automatically moderates comments. Rejects comments containing the word "orange", approves all others. |
| **Event Bus** | 4005 | Central event broker. Receives events and fans them out to all services. Stores events for replay. |
| **Client** | 3000 | React SPA with Bootstrap 4. Communicates with backend services through the ingress. |

## Tech Stack

- **Frontend:** React 18, Axios, Bootstrap 4
- **Backend:** Node.js, Express, Axios
- **Container Runtime:** Docker
- **Orchestration:** Kubernetes (k3d / k3s)
- **Ingress:** NGINX Ingress Controller
- **Dev Tooling:** Skaffold, Nodemon

## Project Structure

```
blog-boilerplate/
├── client/                  # React frontend
│   ├── Dockerfile
│   ├── public/
│   └── src/
│       ├── app.js           # Main App component
│       ├── postCreate.js    # Form to create posts
│       ├── PostList.js      # Displays all posts
│       ├── CommentCreate.js # Form to add comments
│       └── CommentList.js   # Displays comments with moderation status
├── posts/                   # Posts microservice
│   ├── Dockerfile
│   └── index.js
├── comments/                # Comments microservice
│   ├── Dockerfile
│   └── index.js
├── query/                   # Query microservice (read model)
│   ├── Dockerfile
│   └── index.js
├── moderation/              # Moderation microservice
│   ├── Dockerfile
│   └── index.js
├── event-bus/               # Event bus microservice
│   ├── Dockerfile
│   └── index.js
├── infra/
│   └── k8s/
│       ├── client-depl.yaml       # Client Deployment + ClusterIP Service
│       ├── posts-depl.yaml        # Posts Deployment + ClusterIP Service
│       ├── posts-srv.yaml         # Posts NodePort Service (optional)
│       ├── comments-depl.yaml     # Comments Deployment + ClusterIP Service
│       ├── query-depl.yaml        # Query Deployment + ClusterIP Service
│       ├── moderation-depl.yaml   # Moderation Deployment + ClusterIP Service
│       ├── event-bus-depl.yaml    # Event Bus Deployment + ClusterIP Service
│       └── ingress-srv.yaml       # NGINX Ingress routing rules
└── skaffold.yaml                  # Skaffold config for local dev
```

## Ingress Routing

All traffic enters through `http://posts.com` and is routed by the NGINX Ingress Controller:

| Path | Method | Routed To | Purpose |
|------|--------|-----------|---------|
| `/` | GET | client-srv:3000 | Serve React app |
| `/posts/create` | POST | posts-clusterip-srv:4000 | Create a new post |
| `/posts` | GET | query-srv:4002 | Fetch all posts with comments |
| `/posts/:id/comments` | POST | comments-srv:4001 | Add a comment to a post |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with WSL2 backend on Windows)
- [k3d](https://k3d.io/) (lightweight Kubernetes in Docker)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Skaffold](https://skaffold.dev/docs/install/) (for local development)

## Setup

### 1. Create the k3d Cluster

Create a cluster with port 80/443 mapped to localhost and Traefik disabled (we use NGINX Ingress instead):

```bash
k3d cluster create mycluster \
  -p "80:80@loadbalancer" \
  -p "443:443@loadbalancer" \
  --k3s-arg "--disable=traefik@server:0"
```

### 2. Install NGINX Ingress Controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
```

Wait for the controller to be ready:

```bash
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
```

### 3. Configure the Hosts File

Add the following entry to your hosts file so that `posts.com` resolves to localhost:

**Windows** (`C:\Windows\System32\drivers\etc\hosts` -- edit as Administrator):
```
127.0.0.1  posts.com
```

**macOS / Linux** (`/etc/hosts`):
```
127.0.0.1  posts.com
```

> **Important:** If your browser uses **Secure DNS (DNS over HTTPS)**, it will bypass the hosts file. You must disable it:
> - **Chrome:** `chrome://settings/security` --> Turn off "Use secure DNS"
> - **Edge:** `edge://settings/privacy` --> Turn off "Use secure DNS"
> - **Firefox:** Settings --> Privacy & Security --> DNS over HTTPS --> Off

### 4. Start the Application

**Option A: Using Skaffold (Recommended for development)**

Skaffold builds images, deploys to the cluster, and live-syncs code changes:

```bash
skaffold dev
```

Any changes to `.js` files will be automatically synced to the running containers without a full rebuild.

**Option B: Manual Deployment**

Build all images:

```bash
docker build --provenance=false -t ankiitsingh21/posts ./posts
docker build --provenance=false -t ankiitsingh21/comments ./comments
docker build --provenance=false -t ankiitsingh21/query ./query
docker build --provenance=false -t ankiitsingh21/moderation ./moderation
docker build --provenance=false -t ankiitsingh21/event-bus ./event-bus
docker build --provenance=false -t ankiitsingh21/client ./client
```

Import images into the k3d cluster:

```bash
k3d image import \
  ankiitsingh21/posts \
  ankiitsingh21/comments \
  ankiitsingh21/query \
  ankiitsingh21/moderation \
  ankiitsingh21/event-bus \
  ankiitsingh21/client \
  -c mycluster
```

Apply all Kubernetes manifests:

```bash
kubectl apply -f infra/k8s/
```

### 5. Access the Application

Open your browser and navigate to:

```
http://posts.com
```

## Usage

1. **Create a Post** -- Enter a title in the "Create Post" form and click Submit
2. **Add a Comment** -- Type a comment under any post and click Submit
3. **Moderation** -- Comments are automatically moderated:
   - Comments containing the word **"orange"** are **rejected**
   - All other comments are **approved**
4. **Comment Statuses:**
   - `pending` -- "This comment is awaiting moderation"
   - `approved` -- The comment content is displayed
   - `rejected` -- "This comment has been rejected"

## API Reference

### Posts Service (port 4000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/posts` | List all posts |
| POST | `/posts/create` | Create a new post. Body: `{ "title": "string" }` |
| POST | `/events` | Receive events from the event bus |

### Comments Service (port 4001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/posts/:id/comments` | List comments for a post |
| POST | `/posts/:id/comments` | Create a comment. Body: `{ "content": "string" }` |
| POST | `/events` | Receive events from the event bus |

### Query Service (port 4002)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/posts` | Get all posts with embedded comments |
| POST | `/events` | Receive events from the event bus |

### Event Bus (port 4005)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/events` | Receive and broadcast an event to all services |
| GET | `/events` | Get all stored events (for replay) |

### Moderation Service (port 4003)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/events` | Receive events; moderates `CommentCreated` events |

## Event Types

| Event | Emitted By | Consumed By | Payload |
|-------|-----------|-------------|---------|
| `PostCreated` | Posts | Query | `{ id, title }` |
| `CommentCreated` | Comments | Query, Moderation | `{ id, content, postId, status }` |
| `CommentModerated` | Moderation | Comments | `{ id, content, postId, status }` |
| `CommentUpdated` | Comments | Query | `{ id, content, postId, status }` |

## Troubleshooting

### `ERR_CONNECTION_REFUSED` on `posts.com`

- The k3d cluster was not created with port mapping. Recreate it:
  ```bash
  k3d cluster delete mycluster
  k3d cluster create mycluster -p "80:80@loadbalancer" -p "443:443@loadbalancer" --k3s-arg "--disable=traefik@server:0"
  ```

### `ERR_CONNECTION_TIMED_OUT` on `posts.com`

- Your browser's **Secure DNS** is bypassing the hosts file. Disable it in browser settings (see [Step 3](#3-configure-the-hosts-file) above).

### Client pod crashes with `ENOENT powershell.exe`

- The React dev server tries to open a browser inside the container. The `client-depl.yaml` sets `BROWSER=none` to prevent this. Ensure the env var is present in the deployment.

### `invalid tar header` when importing images to k3d

- Docker Buildx creates OCI images with attestation layers that k3d can't parse. Build with `--provenance=false`:
  ```bash
  docker build --provenance=false -t ankiitsingh21/posts ./posts
  ```

### Pods stuck in `ImagePullBackOff`

- Images need to be loaded into k3d (it can't access your local Docker images directly):
  ```bash
  k3d image import ankiitsingh21/posts -c mycluster
  ```

### Verify cluster health

```bash
kubectl get pods                    # All pods should be Running 1/1
kubectl get svc                     # All services should have ClusterIPs
kubectl get ingress                 # Should show ADDRESS and posts.com host
kubectl get pods -n ingress-nginx   # Controller should be Running
```

## Design Decisions

- **Event-Driven Architecture:** Services communicate asynchronously through events via a central event bus, enabling loose coupling.
- **CQRS Pattern:** Write operations go to individual services (Posts, Comments), while reads go through the Query service which maintains a denormalized view.
- **Event Replay:** The Query service replays all past events from the Event Bus on startup, rebuilding its in-memory state for resilience against restarts.
- **In-Memory Storage:** All data is stored in memory (no database) to keep the focus on microservices patterns. Data is lost on pod restarts (except the Query service which can recover via event replay).
