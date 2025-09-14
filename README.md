# Executive Dashboard MVP
A high-performance, AI-enhanced executive dashboard built as a Minimum Viable Product (MVP) to validate the concept of a unified decision-intelligence platform. This full-stack application delivers real-time KPI monitoring with advanced visualizations and AI-powered insights, all while enforcing strict performance budgets.

**Live Demo:** 
http://52.16.34.82/api/health
http://52.16.34.82/api/quality-gates

**Dashboard Screenshot:** 
<img width="1470" height="956" alt="Screenshot 2025-09-14 at 11 39 50" src="https://github.com/user-attachments/assets/73996ee5-da52-4fbd-842c-ec0720225329" />


## 🚀 Features

- **📊 Unified KPI Dashboard**: View all critical business metrics in a single pane of glass with normalized data semantics
- **🤖 AI-Powered Insights**: Integrates with OpenAI APIs to generate intelligent summaries and explanations for data trends
- **📈 Dynamic Visualizations & Drill-Downs**: Built with React, TypeScript, and ECharts for interactive and responsive charts
- **👁️ Real-User Monitoring (RUM)**: Ingests client-side performance metrics to measure actual user experience
- **✅ Automated Quality Gates**: Includes a dedicated API to enforce System Level Objectives (SLOs):
  - p95 Time to First Byte (TTFB) < 300ms
  - p95 Render Time < 1s
  - p95 Interaction Response < 200ms
  - 30-second alert polling cycles
- **🚀 Zero-Downtime Deployments**: Full CI/CD pipeline with GitHub Actions and Docker enables production updates in under 180 seconds

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, ECharts, Vite, Tailwind CSS |
| **Backend** | FastAPI, Python 3.10, SQLite (WAL mode), Pydantic |
| **AI Integration** | OpenAI GPT-4 API |
| **Monitoring** | Custom RUM, Quality-Gates API |
| **DevOps** | Docker, GitHub Actions, AWS EC2, Docker Compose |
| **Architecture** | Client-Server API, Responsive Design, Component-Based UI |

## 📦 Installation & Local Development

Getting the project up and running on your local machine is straightforward using the provided startup script.

### Prerequisites

- **Bash Shell** (Linux/macOS) or **WSL/Git Bash** (Recommended for Windows)
- **Docker** and **Docker Compose** (v2.0+)
- **Node.js** (v18 or later) *[Only required for separate development]*

### Quick Start with `./start.sh` (Recommended)

The easiest way to run the entire application is using the automated script.

1. **Clone the Repository**
   ```bash
   git clone https://github.com/rebeccarj-im/manufacturing-saas-dashboard.git
   cd manufacturing-saas-dashboard
2. **Make the script executable**
   chmod +x ./start.sh
3. **Run the Startup Script**
   ./start.sh

This single command will:

- Build and start all services (Frontend, Backend, Database) using Docker Compose
- Stream logs from all containers to your terminal
- The application will be available at:
  - Frontend: http://localhost:5173
  - Backend API: http://localhost:8000
  - API Documentation: http://localhost:8000/docs

