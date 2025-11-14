# Executive Dashboard MVP

A high-performance, AI-enhanced executive dashboard built as a Minimum Viable Product (MVP) to validate the concept of a unified decision-intelligence platform. This full-stack application delivers real-time KPI monitoring with advanced visualizations and AI-powered insights, all while enforcing strict performance budgets.

<img width="1464" height="867" alt="image" src="https://github.com/user-attachments/assets/81ac59a3-7290-4800-8d3d-de274a586130" />



## Live Demo
http://3.248.229.177/dashboard

---

## 🚀 Features

- **📊 Unified KPI Dashboard**  
  View all critical business metrics in a single pane of glass with normalized data semantics.

- **🤖 AI-Powered Insights**  
  Integrates with OpenAI APIs to generate intelligent summaries and explanations for data trends.

- **🧠 Embedded AI Agent (Bottom-Right Corner)**  
  A context-aware AI agent docked in the bottom-right corner of the UI, allowing:
  - Natural language questions about KPIs and trends  
  - Explanations of anomalies and performance changes  
  - Exploratory analysis directly on top of live data

- **📈 Dynamic Visualizations & Drill-Downs**  
  Built with React, TypeScript, and ECharts for interactive and responsive charts.

- **👁️ Real-User Monitoring (RUM)**  
  Ingests client-side performance metrics to measure actual user experience.

- **✅ Automated Quality Gates**  
  Includes a dedicated API to enforce System Level Objectives (SLOs):
  - p95 Time to First Byte (TTFB) < 300ms  
  - p95 Render Time < 1s  
  - p95 Interaction Response < 200ms  
  - 30-second alert polling cycles

- **🚀 Zero-Downtime Deployments**  
  Full CI/CD pipeline with GitHub Actions and Docker enables production updates in under 180 seconds.

---

## 🔜 In Progress / Upcoming Capabilities

The platform is actively evolving toward a richer, more personalized decision-intelligence experience. The following capabilities are **in development** and will be available soon:

- **💬 In-App Messaging & Notifications**  
  Contextual system and AI-driven messages surfaced directly in the UI (e.g., alerts, insights, anomalies).

- **🔍 Global Search**  
  Unified, natural-language search across KPIs, dashboards, entities, and AI-generated insights.

- **🔐 Authentication & Authorization**  
  Login, session management, and role-based access control to support secure multi-user environments.

- **👤 User Profiles & Preferences**  
  User-level configuration for:
  - Saved dashboard views  
  - AI agent preferences  
  - Notification and alert settings  
  - Basic user information management

---

## 🛠️ Tech Stack

| Layer        | Technology                                                    |
|-------------|----------------------------------------------------------------|
| **Frontend** | React 18, TypeScript, ECharts, Vite, Tailwind CSS             |
| **Backend**  | FastAPI, Python 3.10, SQLite (WAL mode), Pydantic             |
| **AI Integration** | OpenAI GPT-4 API, embedded AI agent in the dashboard UI |
| **Monitoring** | Custom RUM, Quality-Gates API                               |
| **DevOps**   | Docker, GitHub Actions, AWS EC2, Docker Compose               |
| **Architecture** | Client-Server API, Responsive Design, Component-Based UI  |

---

## 📦 Installation & Local Development

Getting the project up and running on your local machine is straightforward using the provided startup script.

### Prerequisites

- **Bash Shell** (Linux/macOS) or **WSL/Git Bash** (recommended for Windows)
- **Docker** and **Docker Compose** (v2.0+)
- **Node.js** (v18 or later) — *only required for separate frontend development*

### Quick Start with `./start.sh` (Recommended)

The easiest way to run the entire application is using the automated script.

1. **Clone the Repository**
   ```bash
   git clone https://github.com/rebeccarj-im/manufacturing-saas-dashboard.git
   cd manufacturing-saas-dashboard
   ```

2. **Make the Script Executable**
   ```bash
   chmod +x ./start.sh
   ```

3. **Run the Startup Script**
   ```bash
   ./start.sh
   ```

This single command will:

- Build and start all services (Frontend, Backend, Database) using Docker Compose  
- Stream logs from all containers to your terminal  

Once running, the application will be available at:

- **Frontend**: http://localhost:5173  
- **Backend API**: http://localhost:8000  
- **API Documentation**: http://localhost:8000/docs




