# Linux Deployment & Offline Operation

## 1. System Requirements & Prerequisites
* **Operating System**: Linux (Ubuntu 20.04+, Debian 11+, RHEL 8+, or compatible POSIX distribution).
* **Python**: Python 3.10, 3.11, or 3.12 with `python3-venv` and `pip` installed.
* **Shell**: Standard Bash shell for automation scripts.
* **Hardware**: Standard x86_64 or ARM64 workstation/server (runs entirely on CPU without GPU requirements).

---

## 2. Standard Installation & Startup

### Step 1: Environment Setup
Run the automated setup script to create an isolated virtual environment and install dependencies:
```bash
chmod +x setup.sh run.sh
./setup.sh
```
`setup.sh` executes:
1. `python3 -m venv .venv`
2. `source .venv/bin/activate`
3. `pip install --upgrade pip`
4. `pip install -r requirements.txt`

### Direct Dependencies Installed:
* `fastapi==0.116.1`: Web framework and REST APIs.
* `uvicorn[standard]==0.35.0`: High-performance ASGI server.
* `python-multipart==0.0.20`: Streaming multipart file upload support.
* `scikit-learn==1.7.1`: Isolation Forest machine learning implementation.
* `networkx==3.5`: Graph data structures and modularity community detection algorithms.
* `matplotlib==3.11.2`: In-memory vector PDF report generation (`backend_pdf.PdfPages`).
* `pytest==8.4.2`: Automated test suite runner.

### Step 2: Running the Application
Launch the server using `run.sh`:
```bash
./run.sh
```
`run.sh` automatically checks for `.venv/bin/python` and launches Uvicorn on `http://127.0.0.1:8000`.

### Step 3: Accessing the Dashboard
Open any standard web browser and navigate to:
```
http://127.0.0.1:8000
```

---

## 3. Air-Gapped / Offline Deployment Architecture

> [!IMPORTANT]
> **Distinction Between Setup and Runtime**:
> * **Installation Time**: Acquiring Python wheels and system packages requires internet access (or an offline wheelhouse).
> * **Runtime**: Once dependencies are installed, the application requires **ZERO** internet connectivity or external API calls.

### Offline Air-Gap Staging Procedure:
1. **Prepare Wheelhouse on Connected Machine**:
   ```bash
   pip download -r requirements.txt -d ./wheelhouse
   ```
2. **Transfer to Air-Gapped Target**:
   Copy the project directory along with `./wheelhouse` to the target machine via approved offline media.
3. **Install Offline**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install --no-index --find-links ./wheelhouse -r requirements.txt
   ```

### Runtime Offline Guarantees:
* **UI & Visualization Assets**: `cytoscape.min.js`, `app.js`, and `style.css` are hosted strictly from `/assets/`. No CDNs or Google Fonts are used.
* **GeoIP / ASN Resolution**: Uses local RFC1918 range classification and optional local MaxMind `.mmdb` files via `GEOIP_CITY_DB` / `GEOIP_ASN_DB` environment variables.
* **In-Memory ML & Reports**: Isolation Forest and PDF reporting execute 100% in-process on CPU and stream directly to HTTP clients.
* **Persistent Case Storage**: Operates entirely against local SQLite (`data/cases.db`).

*(Note: Static offline readiness has been verified through codebase inspection; physical network-isolation execution was not performed in this testing environment).*

---

## 4. Docker Deployment (Alternative)
For containerized deployments where Docker is available:
```bash
docker build -t bitcoin-traffic-intel .
docker run -p 8000:8000 bitcoin-traffic-intel
```
The Dockerfile builds a minimal `python:3.12-slim` container, installs `requirements.txt`, and exposes port `8000`.
