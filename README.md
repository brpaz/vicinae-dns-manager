# DNS Manager

> View the active DNS server and its latency, and switch to common DNS presets

## 🎯 Features

- Shows the DNS server currently active on your default network connection, with its live query latency.
- Switch to a common DNS preset (Cloudflare, Google, Quad9, OpenDNS) or back to the DNS assigned automatically by DHCP.
- Shows the query latency of every preset up front, so you can pick the fastest one.

## 🚀 Getting Started

## Prerequisites

- [Node.js](https://nodejs.org/) (recommended version 24 or higher)

### Installation

### Build From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/brpaz/vicinae-dns-manager.git
2. Navigate to the project directory:
   ```bash
   cd dns-manager
3. Install dependencies:
   ```bash
   npm i
4. Build the project:
   ```bash
   npm run build
   ```

This will install the extension in `~/.local/share/vicinae/extensions`, and will be available immediately on your Vicinae app.

## Development

In development, you can use the following command to watch for changes and rebuild your extension automatically:

```bash
npm run dev
```

## 🧰 Usage

Open **Manage DNS**. The **Active** section shows your current default connection's DNS server and its latency. Select a preset under **Presets** and hit Enter to switch, or pick **Automatic (DHCP)** to go back to what your network assigns.

### Requirements

- Linux with NetworkManager (the extension shells out to `nmcli`).
- DNS is switched on whichever connection currently owns the default route — the extension detects this automatically.

### NetworkManager's dnsmasq mode

If NetworkManager is configured with `dns=dnsmasq` (`/etc/NetworkManager/conf.d/*.conf`), all DNS resolution goes through its embedded dnsmasq instance, and `nmcli`'s `IP4.DNS` only reports the DHCP-received server — not what dnsmasq is actually configured to forward to. In that case the extension instead reads the general-purpose `server=` entries from `/etc/NetworkManager/dnsmasq.d/*.conf` (domain-scoped split-DNS entries like `server=/example.com/ip` are ignored), probes each in priority order, and shows the first one that actually answers as "Active" — a "Configured Upstream" section lists the full fallback chain with live latency for each.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.