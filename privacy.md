**Privacy Policy — short**

This project stores minimal personal data to provide user accounts and game features: username and email. Below is a short policy you can adapt for your deployment.

**Data controller**: You (or your org). Provide contact details here.

**What we store**
- Account: username, email, hashed password, role
- Votes: username and poll choices (used for poll functionality)

**Legal basis**
- Account data is processed for contract fulfilment and legitimate interest in providing the service.

**Data retention**
- Users can request deletion (DSR) via the provided endpoint `/api/me` (DELETE). We will delete account row and associated votes.

**Data access / export**
- Users can export their data via `/api/me/export` which returns a JSON file with their account and related data.

**Third parties**
- We may use SMTP providers and other processors; ensure DPAs are in place in production.

**Security**
- Passwords are hashed with bcrypt. JWTs are used for authentication.

**Contact**
- Add contact info and complaint procedures here.
