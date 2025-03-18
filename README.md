# School Management System - Microservices Implementation

## What We've Built

I've split the original monolithic app into four simpler parts:

1. **API Gateway** (Port 3000)

   - Main entry point for all requests
   - Routes requests to the right service
   - Handles authentication checks
   - Prevents system overload

2. **Auth Service** (Port 3001)

   - Handles logins and signups
   - Manages login tokens
   - Supports Google/Microsoft login
   - Records login attempts

3. **Tenant Service** (Port 3002)

   - Manages schools (tenants)
   - Handles users and permissions
   - Creates databases for new schools
   - Keeps school data separate

4. **Audit Service** (Port 3003)
   - Records all important actions
   - Stores logs in the right database
   - Provides reports on system activity
   - Helps track security issues

## Key Features

- **Separate Databases**: Each school has its own database for privacy
- **Message Queue**: Uses Kafka to reliably pass messages between services
- **Circuit Breaker**: Prevents one failing service from breaking everything
- **Docker Ready**: Easy to deploy with Docker Compose

## How to Run It

1. Start everything with one command:

   ```
   docker-compose up -d
   ```

2. Access the services at:
   - Main API: http://localhost:3000
   - Auth Service: http://localhost:3001
   - Tenant Service: http://localhost:3002
   - Audit Service: http://localhost:3003

## Benefits

- Each service can be updated independently
- System keeps working even if one part fails
- Easy to scale busy services without scaling everything
- Better security with separate databases
- Clearer code organization

This implementation satisfies the requirements in Part 2 of the assessment, demonstrating a practical approach to microservices architecture.
