# NATS JWT + NKey Authentication Setup

This guide explains how to set up NATS server with JWT + NKey authentication.

## Overview

The application uses JWT + NKey authentication for secure NATS connections. Each user gets:
- A unique NKey pair (public/private)
- A JWT token containing user permissions
- Credentials file combining both

## Quick Setup (Development)

For development/testing, you can run NATS without JWT authentication first to test the application flow. The client-side authentication is implemented, but the server needs to be configured to accept JWT credentials.

### Option 1: NATS without Authentication (Testing)

```bash
# Start NATS with WebSocket support (no auth)
nats-server -ws 8080
```

**Note**: This allows connections without authentication. Use only for development.

### Option 2: NATS with JWT Authentication (Production-like)

1. **Install nsc (NATS Account/User Management Tool)**

```bash
# macOS
brew tap nats-io/nats-tools
brew install nats-io/nats-tools/nsc

# Linux
curl -L https://github.com/nats-io/natscli/releases/latest/download/nats-linux-amd64.zip -o nats.zip
unzip nats.zip
sudo mv nats /usr/local/bin/
```

2. **Create NATS Operator and Account**

```bash
# Create a new operator
nsc add operator MyOperator

# Create an account
nsc add account MyAccount

# Create a user (this generates credentials)
nsc add user MyUser --account MyAccount
```

3. **Generate Server Configuration**

```bash
# Generate server config with JWT authentication
nsc generate config --nats-resolver > nats-jwt.conf
```

4. **Start NATS Server with JWT Config**

```bash
nats-server -c nats-jwt.conf -ws 8080
```

5. **Update Backend to Use Generated Credentials**

The backend generates user credentials programmatically. For production, you may want to:
- Use `nsc` to generate user credentials
- Store them securely
- Issue them through your authentication system

## How It Works

### Backend Flow

1. User registers/logs in via `/api/auth/register` or `/api/auth/login`
2. Backend generates:
   - NKey pair using `nkeys.js`
   - JWT token with user claims
   - Returns both to frontend

### Frontend Flow

1. User authenticates and receives JWT + NKey seed
2. Frontend formats credentials file
3. Connects to NATS using `credsAuthenticator` with credentials
4. NATS server validates JWT and NKey signature

### JWT Structure

The JWT contains:
- User identity (userId, username)
- NKey public key (subject)
- NATS permissions (pub/sub limits)
- Expiration time

## Production Considerations

1. **Secure Storage**: Store NKey seeds securely (encrypted database)
2. **JWT Secret**: Use a strong, environment-specific JWT secret
3. **Password Hashing**: Implement proper password hashing (bcrypt, argon2)
4. **Token Expiration**: Set appropriate JWT expiration times
5. **NATS Operator Setup**: Use `nsc` for proper operator/account hierarchy
6. **Credential Rotation**: Implement credential rotation policies

## Testing

1. Start backend: `cd be && bun run dev`
2. Start frontend: `cd fe && bun run dev`
3. Register a new user
4. Login and connect to NATS
5. Verify real-time data updates work

## Troubleshooting

### Connection Fails with Authentication Error

- Ensure NATS server is configured to accept JWT authentication
- Check that JWT format matches NATS requirements
- Verify NKey seed is correctly formatted

### "Invalid Credentials" Error

- Check that credentials file format is correct
- Ensure JWT hasn't expired
- Verify NKey seed is valid
