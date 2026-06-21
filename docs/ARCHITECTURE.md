# SOKON Backend Architecture

The backend follows a feature-based modular structure inspired by Clean Architecture.

Each module contains:

- Model: Mongoose schema and indexes
- Routes: Express route definitions
- Validators: Request validation rules
- Controllers: HTTP request/response handling
- Services: Business rules and cross-model logic

Cross-cutting concerns are placed in:

- `middleware/`: authentication, RBAC, validation, error handling, security, upload
- `services/`: email and storage abstractions
- `utils/`: tokens, errors, responses, pagination, templates
- `jobs/`: cron/background tasks
- `config/`: environment, logging, database, Swagger, Cloudinary

The API returns consistent success and error formats.
