# Medi Cure - User + Medi Cure X - Admin

Two app-style web applications connected to one shared SQLite backend.

- **Medi Cure - User** → patient/user app: `/medicare/`
- **Medi Cure X - Admin** → doctor/hospital/admin app: `/partner/`
- Shared API/database → one Node.js server

## Run

Requires Node.js 22.5+.

```bash
npm install
npm start
```

Then on the host computer:

- Patient app: http://localhost:3000/medicare/
- Partner app: http://localhost:3000/partner/

## Two-device hackathon demo

Connect both devices to the same Wi-Fi/network.

1. On the computer running the server, run `ipconfig` on Windows and find its IPv4 address (for example `192.168.1.10`).
2. On the patient device open `http://192.168.1.10:3000/medicare/`.
3. On the doctor/admin device open `http://192.168.1.10:3000/partner/`.
4. If Windows Firewall asks, allow Node.js on the private network.

Both apps use the same database, so actions are shared between devices. For example, adding a doctor in Medi Cure X - Admin makes that doctor available in Medi Cure - User; booking an appointment in MediCare appears in the Partner appointment panel.

## App concept

This is intentionally structured like a two-sided platform:

**Medi Cure - User** = people/patients

**Medi Cure X - Admin** = doctors, hospitals and administrators

The two interfaces are separate, but the backend is shared.
