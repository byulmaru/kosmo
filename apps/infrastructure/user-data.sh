#!/bin/bash

# Update system
dnf update -y

# Wait for any concurrent package operations to complete
while fuser /var/lib/rpm/.rpm.lock >/dev/null 2>&1; do
  echo "Waiting for other package operations to complete..."
  sleep 5
done

# Install basic packages
dnf install -y curl wget

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Start and enable tailscaled
systemctl enable --now tailscaled

# Join Tailscale network as exit node
tailscale up --authkey=${tailscale_authkey} \
  --hostname=kosmo-exit-node \
  --accept-routes \
  --advertise-routes=10.0.0.0/16 \
  --advertise-exit-node

# Configure firewall to allow SSH and Tailscale
firewall-cmd --permanent --add-service=ssh
firewall-cmd --permanent --add-port=41641/udp
firewall-cmd --reload

# Enable IP forwarding for exit node functionality
echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf
echo 'net.ipv6.conf.all.forwarding = 1' >> /etc/sysctl.conf
sysctl -p

# Create status script
cat > /home/opc/tailscale-status.sh << 'EOL'
#!/bin/bash
echo "=== Tailscale Exit Node Status ==="
echo "Hostname: $(hostname)"
echo "Tailscale Status:"
sudo tailscale status
echo ""
echo "Advertised Routes:"
sudo tailscale status --json | grep -A 10 "AdvertisedRoutes"
echo ""
echo "=== Network Configuration ==="
echo "IP Forwarding enabled:"
cat /proc/sys/net/ipv4/ip_forward
echo ""
echo "=== Instructions ==="
echo "1. On your local machine, connect to Tailscale: tailscale up"
echo "2. Enable this exit node in Tailscale admin console"
echo "3. Use this node as exit node to access private Kubernetes API"
EOL

chmod +x /home/opc/tailscale-status.sh
chown opc:opc /home/opc/tailscale-status.sh

echo "Tailscale exit node setup completed!" > /var/log/user-data.log
