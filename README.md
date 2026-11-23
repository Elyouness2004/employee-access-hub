
# Employee Access Hub

### Enterprise Identity & Access Management Platform

Employee Access Hub est une plateforme de gestion des identités et des accès (IAM), conçue pour centraliser l'authentification, les autorisations et la gestion des comptes des collaborateurs au sein d'une entreprise.

Le projet repose sur une architecture microservices développée avec **Spring Boot**, sécurisée par **Keycloak** et **Spring Cloud Gateway**, et accessible à travers une interface web réalisée avec **React et TypeScript**.

L'objectif est de proposer un environnement unifié permettant aux collaborateurs d'accéder aux différents services de l'entreprise à partir d'une seule authentification, tout en garantissant un contrôle précis des permissions selon leurs responsabilités.

La plateforme intègre également la gestion des ressources humaines, des congés, des notes de frais, des documents et des données analytiques.

---

## 1. Objectifs du projet

- Centraliser la gestion des identités et des accès.
- Mettre en place une authentification unique (Single Sign-On).
- Automatiser la création, la modification et la désactivation des comptes.
- Gérer les autorisations à travers un modèle RBAC.
- Sécuriser les communications entre les applications.
- Faciliter la gestion des processus internes.
- Assurer la traçabilité des opérations et des événements de sécurité.

---

## 2. Architecture technique

La plateforme adopte une architecture microservices dans laquelle chaque service possède une responsabilité métier spécifique.

```text
                    React SPA
                        |
                        v
                     Keycloak
                 Authentication / SSO
                        |
                        v
               Spring Cloud Gateway
                 JWT Validation
                        |
          +-------------+-------------+
          |             |             |
          v             v             v
      HR Service    Leave Service  Expense Service
          |             |             |
          +-------------+-------------+
                        |
          +-------------+-------------+
          |                           |
          v                           v
   Documents Service          Analytics Service
          |                           |
          +-------------+-------------+
                        |
                  PostgreSQL
                        |
                     RabbitMQ
```

### Frontend — React & TypeScript

L'interface web constitue le point d'accès principal à la plateforme. Elle permet aux utilisateurs de consulter leurs informations, d'effectuer leurs demandes et d'accéder aux fonctionnalités autorisées selon leur rôle.

### Identity Provider — Keycloak

Keycloak assure la gestion des identités, l'authentification des utilisateurs et le Single Sign-On à travers OAuth 2.0 et OpenID Connect.

### API Gateway — Spring Cloud Gateway

La Gateway représente le point d'entrée des requêtes API. Elle assure leur routage vers les microservices concernés et effectue une première validation des JWT.

### Backend — Spring Boot Microservices

Les fonctionnalités métier sont réparties entre plusieurs services indépendants, chacun disposant de ses propres responsabilités et règles de sécurité.

### Database — PostgreSQL

PostgreSQL assure la persistance des données, avec une séparation logique des schémas entre les services métier.

### Messaging — RabbitMQ

RabbitMQ permet la communication asynchrone entre les services à travers des événements métier. Son utilisation repose sur un mécanisme de publication configurable, associé au pattern Transactional Outbox.

---

## 3. Microservices

### HR Service — Human Resources Management

Ce service centralise la gestion des collaborateurs et de leur identité au sein de l'entreprise.

**Fonctionnalités :**
- Gestion des employés, départements et postes.
- Consultation des profils et des équipes.
- Synchronisation des informations avec Keycloak.
- Gestion du cycle de vie des comptes utilisateurs.
- Administration des sessions et des événements d'audit.

### Leave Service — Leave Management

Ce service prend en charge le processus de gestion des congés.

**Fonctionnalités :**
- Soumission des demandes de congé.
- Consultation des soldes disponibles.
- Validation ou refus des demandes.
- Gestion des conflits entre périodes de congé.
- Annulation automatique des demandes concernées lors du départ d'un collaborateur.

### Expense Service — Expense Management

Ce service permet de gérer les notes de frais des collaborateurs.

**Fonctionnalités :**
- Création et suivi des demandes de remboursement.
- Consultation des dépenses personnelles.
- Validation par le responsable hiérarchique.
- Gestion des approbations à plusieurs niveaux.
- Application des règles métier selon les montants et les responsabilités.

### Documents Service — Document Management

Ce service assure la gestion et la sécurisation des documents internes.

**Fonctionnalités :**
- Importation et téléchargement des documents.
- Organisation des fichiers par catégorie.
- Contrôle des accès selon les rôles et les propriétaires.
- Vérification des formats et des tailles autorisés.
- Journalisation des téléchargements.

### Analytics Service — Reporting & Analytics

Ce service regroupe les informations provenant des autres microservices afin de fournir une vision globale des activités.

Il permet de consulter des indicateurs, d'alimenter les tableaux de bord et de préparer les données destinées aux outils de reporting tels que Power BI.

---

## 4. Identity & Access Management

La gestion des identités constitue l'un des éléments centraux du projet.

La plateforme utilise **Keycloak** comme fournisseur d'identité et applique un modèle de contrôle d'accès basé sur les rôles.

### User Roles

| Role | Responsibilities |
|------|------------------|
| `EMPLOYEE` | Accès aux informations personnelles et aux services disponibles |
| `MANAGER` | Gestion des demandes et consultation des informations de son équipe |
| `HR` | Administration des collaborateurs et des processus RH |
| `ADMIN` | Administration globale, gestion des accès et supervision de la sécurité |

### Single Sign-On (SSO)

Le Single Sign-On permet aux collaborateurs de s'authentifier une seule fois pour accéder aux différentes applications autorisées.

L'authentification repose sur **OpenID Connect**, avec **Authorization Code Flow et PKCE**.

### Identity Lifecycle Management

Le cycle de vie des identités est directement lié aux informations gérées par le service RH.

**Onboarding**

Lorsqu'un nouveau collaborateur est activé, son compte Keycloak est automatiquement créé. Un email lui permet ensuite de définir son mot de passe.

**Synchronization**

Les modifications des informations professionnelles, des responsabilités ou des rôles sont synchronisées avec Keycloak.

**Offboarding**

Lorsqu'un collaborateur quitte l'entreprise, son compte est désactivé et ses sessions actives sont révoquées.

Cette approche permet de maintenir la cohérence entre les données RH et les droits d'accès aux applications.

---

## 5. Security

La sécurité repose sur plusieurs mécanismes complémentaires.

### JWT Authentication

Les requêtes API sont authentifiées à l'aide de JSON Web Tokens émis par Keycloak.

### Role-Based Access Control (RBAC)

Les autorisations sont attribuées selon les rôles des utilisateurs et leurs responsabilités au sein de l'entreprise.

### Multi-Layer Authorization

Les contrôles d'accès sont appliqués à trois niveaux :

1. **API Gateway** : validation du token avant le routage.
2. **Microservices** : nouvelle validation du token au niveau de chaque service.
3. **Business Logic** : vérification des rôles et des droits d'accès aux ressources.

### Session Management

Les utilisateurs peuvent consulter et révoquer leurs sessions actives.

### Audit & Traceability

Les opérations sensibles et les événements de sécurité sont enregistrés afin d'assurer leur traçabilité.

---

## 6. Technology Stack

| Domaine | Technologies |
|---------|-------------|
| Language | Java 21, TypeScript |
| Backend | Spring Boot 3, Spring Security |
| API Gateway | Spring Cloud Gateway |
| IAM & Authentication | Keycloak, OAuth 2.0, OpenID Connect, JWT |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Database | PostgreSQL 16, Spring Data JPA, Flyway |
| Messaging | RabbitMQ, Transactional Outbox |
| Containerization | Docker, Docker Compose |
| Monitoring | Prometheus, Grafana |
| Logging & Tracing | Loki, Promtail, OpenTelemetry, Tempo |
| Testing | JUnit 5, Testcontainers, Vitest, React Testing Library |

---

## 7. Monitoring & Observability

La plateforme intègre plusieurs outils permettant de surveiller le fonctionnement des services et de faciliter l'identification des problèmes techniques.

- **Prometheus** : collecte des métriques des applications.
- **Grafana** : visualisation des indicateurs techniques à travers des tableaux de bord.
- **Loki & Promtail** : centralisation et consultation des logs.
- **OpenTelemetry & Tempo** : suivi des requêtes à travers les microservices grâce au Distributed Tracing.

L'ensemble facilite l'analyse du comportement des applications et le diagnostic des incidents.

---

## 8. Project Overview

Employee Access Hub regroupe les principales fonctionnalités nécessaires à la gestion des identités et des accès dans un environnement composé de plusieurs applications métier.

Le projet associe une architecture microservices, un système d'authentification centralisé, une gestion automatisée du cycle de vie des identités et des mécanismes de sécurité appliqués à différents niveaux.

Il constitue une mise en pratique des concepts d'architecture logicielle, de développement backend, de sécurité applicative, de systèmes distribués et d'administration des identités.

---

## Author

**Elyouness2004**

GitHub: [github.com/Elyouness2004](https://github.com/Elyouness2004)
