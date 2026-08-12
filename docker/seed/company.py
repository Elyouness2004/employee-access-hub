"""
Synthetic corporate identity for the demo dataset — vocabularies only, no logic.

Everything here is FICTIONAL. "Atlas Numeris" is a coined name and
`atlas-numeris.ma` is a placeholder domain chosen so it does not correspond to
an existing Moroccan company; the name pools are ordinary Moroccan given and
family names combined at random, never a roster of real people. Nothing in the
dataset carries a real identifier (no CIN, passport, phone, IBAN or address) —
the HR schema has no column for any of them, and none is invented here.

The catalogue is deliberately shaped like a ~300-person Moroccan IT services
company: French/English job titles side by side (the norm in Casablanca tech),
departments that map onto the existing `department` table, and job titles that
map onto `position` — no field is used that the schema does not already have.
"""

# ── Company identity ────────────────────────────────────────────────────────

COMPANY_NAME = "Atlas Numeris"
COMPANY_DOMAIN = "atlas-numeris.ma"
COMPANY_INDUSTRY = "Technology / Digital Services / IT Consulting"

#: Office sites and their share of the workforce. The three-letter code is the
#: matricule prefix — the only place a location can live, because `employee` has
#: no city column and the schema is not being extended for the demo.
SITES = [
    ("CAS", "Casablanca", 0.50),
    ("RAB", "Rabat", 0.20),
    ("MAR", "Marrakech", 0.10),
    ("TNG", "Tanger", 0.07),
    ("AGA", "Agadir", 0.05),
    ("FES", "Fès", 0.03),
    ("KEN", "Kénitra", 0.02),
    ("TET", "Tétouan", 0.02),
    ("OUJ", "Oujda", 0.01),
]

# ── Departments ─────────────────────────────────────────────────────────────
#
# Each entry: key, name, description, headcount, head title, sub-manager title
# (None = the head manages the department directly), and the weighted individual
# contributor titles. Headcounts sum to ~300.

DEPARTMENTS = [
    {
        "key": "DG",
        "name": "Direction Générale",
        "description": "Direction générale du groupe : stratégie, gouvernance et pilotage.",
        "headcount": 4,
        "head": "Directeur Général",
        "manager": None,
        "ics": [
            ("Directeur Général Adjoint", 1),
            ("Chief of Staff", 1),
            ("Assistant de Direction", 1),
        ],
    },
    {
        "key": "RH",
        "name": "Ressources Humaines",
        "description": "Recrutement, paie, administration du personnel et développement RH.",
        "headcount": 12,
        "head": "Directeur des Ressources Humaines",
        "manager": None,
        "ics": [
            ("HR Business Partner", 3),
            ("Responsable Paie & Administration du Personnel", 1),
            ("Chargé de Recrutement", 3),
            ("Gestionnaire Paie", 2),
            ("Assistant Ressources Humaines", 2),
        ],
    },
    {
        "key": "FIN",
        "name": "Finance & Comptabilité",
        "description": "Comptabilité générale, contrôle de gestion, trésorerie et reporting financier.",
        "headcount": 14,
        "head": "Directeur Administratif et Financier",
        "manager": None,
        "ics": [
            ("Contrôleur de Gestion", 3),
            ("Comptable Général", 4),
            ("Analyste Financier", 2),
            ("Trésorier", 1),
            ("Assistant Comptable", 2),
        ],
    },
    {
        "key": "IT",
        "name": "IT & Infrastructure",
        "description": "Infrastructure, réseau, cloud et support informatique interne.",
        "headcount": 26,
        "head": "Directeur des Systèmes d'Information",
        "manager": "Responsable Infrastructure",
        "ics": [
            ("Administrateur Systèmes", 3),
            ("Ingénieur Réseau", 3),
            ("Ingénieur Cloud", 3),
            ("Ingénieur DevOps", 4),
            ("Ingénieur IAM", 2),
            ("Administrateur Base de Données", 2),
            ("IT Support Engineer", 6),
        ],
    },
    {
        "key": "ENG",
        "name": "Software Engineering",
        "description": "Conception et développement des plateformes logicielles clients et internes.",
        "headcount": 82,
        "head": "Directeur de l'Ingénierie",
        "manager": "Engineering Manager",
        "ics": [
            ("Senior Software Engineer", 6),
            ("Software Engineer", 8),
            ("Junior Software Engineer", 4),
            ("Backend Developer", 6),
            ("Frontend Developer", 5),
            ("Full Stack Developer", 5),
            ("Mobile Developer", 2),
            ("Tech Lead", 2),
            ("Architecte Logiciel", 1),
        ],
    },
    {
        "key": "SEC",
        "name": "Cybersecurity",
        "description": "Sécurité des systèmes d'information, SOC, audit et gestion des risques.",
        "headcount": 14,
        "head": "Responsable Sécurité des Systèmes d'Information",
        "manager": None,
        "ics": [
            ("Ingénieur Cybersécurité", 4),
            ("Analyste SOC", 4),
            ("Ingénieur Sécurité Applicative", 2),
            ("Consultant Sécurité", 3),
        ],
    },
    {
        "key": "DATA",
        "name": "Data & Analytics",
        "description": "Plateforme data, business intelligence et science des données.",
        "headcount": 22,
        "head": "Directeur Data & Analytics",
        "manager": "Data Engineering Manager",
        "ics": [
            ("Data Engineer", 5),
            ("Data Analyst", 6),
            ("Data Scientist", 3),
            ("Ingénieur BI", 3),
        ],
    },
    {
        "key": "PROD",
        "name": "Product Management",
        "description": "Vision produit, roadmap, design et cadrage fonctionnel.",
        "headcount": 14,
        "head": "Directeur Produit",
        "manager": None,
        "ics": [
            ("Product Manager", 3),
            ("Product Owner", 3),
            ("Business Analyst", 3),
            ("UX Designer", 2),
            ("UI Designer", 1),
        ],
    },
    {
        "key": "QA",
        "name": "Quality Assurance",
        "description": "Qualité logicielle, tests fonctionnels, automatisation et performance.",
        "headcount": 24,
        "head": "Responsable Qualité Logicielle",
        "manager": "QA Manager",
        "ics": [
            ("QA Engineer", 6),
            ("QA Automation Engineer", 5),
            ("Testeur Fonctionnel", 4),
            ("Ingénieur Performance", 2),
        ],
    },
    {
        "key": "MKT",
        "name": "Marketing & Communication",
        "description": "Marketing digital, communication corporate et contenu de marque.",
        "headcount": 12,
        "head": "Directeur Marketing & Communication",
        "manager": None,
        "ics": [
            ("Digital Marketing Manager", 2),
            ("Marketing Specialist", 4),
            ("Chargé de Communication", 3),
            ("Graphiste", 1),
        ],
    },
    {
        "key": "SALES",
        "name": "Sales & Business Development",
        "description": "Développement commercial, grands comptes et avant-vente.",
        "headcount": 20,
        "head": "Directeur Commercial",
        "manager": "Sales Manager",
        "ics": [
            ("Account Manager", 5),
            ("Ingénieur d'Affaires", 4),
            ("Business Development Manager", 3),
            ("Avant-Vente Technique", 2),
        ],
    },
    {
        "key": "SUP",
        "name": "Customer Support",
        "description": "Support client, gestion des incidents et suivi de la qualité de service.",
        "headcount": 26,
        "head": "Directeur Service Client",
        "manager": "Responsable Support Client",
        "ics": [
            ("Customer Support Specialist", 6),
            ("Chargé de Support Niveau 1", 6),
            ("Chargé de Support Niveau 2", 4),
        ],
    },
    {
        "key": "ACH",
        "name": "Procurement",
        "description": "Achats, référencement fournisseurs et approvisionnement.",
        "headcount": 8,
        "head": "Responsable Achats",
        "manager": None,
        "ics": [
            ("Acheteur", 4),
            ("Procurement Specialist", 2),
        ],
    },
    {
        "key": "JUR",
        "name": "Legal & Compliance",
        "description": "Contrats, conformité réglementaire et protection des données.",
        "headcount": 6,
        "head": "Directeur Juridique",
        "manager": None,
        "ics": [
            ("Juriste d'Entreprise", 3),
            ("Responsable Conformité", 1),
        ],
    },
    {
        "key": "OPS",
        "name": "Operations",
        "description": "Gestion de projet, delivery et coordination opérationnelle.",
        "headcount": 10,
        "head": "Directeur des Opérations",
        "manager": None,
        "ics": [
            ("Chef de Projet", 4),
            ("Scrum Master", 2),
            ("PMO Analyst", 2),
        ],
    },
    {
        "key": "ADM",
        "name": "Administration",
        "description": "Services généraux, accueil et gestion administrative des sites.",
        "headcount": 8,
        "head": "Responsable Administratif",
        "manager": None,
        "ics": [
            ("Office Manager", 3),
            ("Assistant Administratif", 3),
        ],
    },
]

#: Free-text description per job title, so the `position` rows read like a real
#: job catalogue rather than bare labels. Titles absent from this map fall back
#: to a generated sentence (see `dataset.position_description`).
POSITION_DESCRIPTIONS = {
    "Directeur Général": "Direction générale de l'entreprise et pilotage du comité exécutif.",
    "Directeur des Ressources Humaines": "Pilotage de la politique RH, de la paie et du développement des talents.",
    "Directeur des Systèmes d'Information": "Responsable des systèmes d'information, de l'infrastructure et de la sécurité opérationnelle.",
    "Directeur de l'Ingénierie": "Direction des équipes d'ingénierie logicielle et des choix techniques structurants.",
    "Engineering Manager": "Encadrement d'une équipe d'ingénierie : delivery, qualité et développement des compétences.",
    "Senior Software Engineer": "Conception et développement de composants applicatifs complexes, revue de code et mentorat.",
    "Software Engineer": "Développement, test et maintenance des applications de la plateforme.",
    "Junior Software Engineer": "Développement encadré de fonctionnalités et correction d'anomalies.",
    "Ingénieur DevOps": "Automatisation des chaînes de build et de déploiement, fiabilité des environnements.",
    "Ingénieur Cybersécurité": "Durcissement des systèmes, gestion des vulnérabilités et réponse aux incidents.",
    "HR Business Partner": "Accompagnement RH de proximité d'un périmètre métier.",
    "Data Engineer": "Construction et exploitation des pipelines de données de la plateforme analytique.",
    "QA Automation Engineer": "Conception et maintenance des suites de tests automatisés.",
    "Product Manager": "Définition de la vision produit, de la roadmap et des priorités de delivery.",
    "Account Manager": "Gestion et développement d'un portefeuille de comptes clients.",
    "Customer Support Specialist": "Traitement des demandes clients et suivi des incidents jusqu'à résolution.",
    "Ingénieur IAM": "Gestion des identités et des accès : annuaire, SSO, habilitations et revues d'accès.",
}

# ── Name pools ──────────────────────────────────────────────────────────────
#
# Ordinary Moroccan given/family names. They are combined at random, so a
# generated employee is a synthetic pairing, not a person.

FIRST_NAMES_M = [
    "Yassine", "Mehdi", "Ayoub", "Hamza", "Anas", "Zakaria", "Othmane", "Amine",
    "Soufiane", "Bilal", "Youssef", "Reda", "Nabil", "Karim", "Khalid", "Rachid",
    "Hicham", "Adil", "Mounir", "Tarik", "Omar", "Ismail", "Abdelilah", "Abdellah",
    "Marouane", "Badr", "Walid", "Yahya", "Ilyas", "Oussama", "Taha", "Salaheddine",
    "Noureddine", "Jamal", "Said", "Driss", "Mustapha", "Abderrahim", "Younes",
    "Achraf", "Aymane", "Zouhair", "Fouad", "Redouane", "Samir", "Nizar", "Ayman",
    "Anouar", "Kamal", "Aziz", "Jaouad", "Hatim", "Yasser", "Chakib", "Abdelmajid",
    "Lahcen", "Brahim", "Hamid", "Rida", "Nordine", "Ossama", "Charaf", "Hafid",
]

FIRST_NAMES_F = [
    "Imane", "Salma", "Sara", "Asmae", "Ghita", "Hajar", "Ikram", "Hind", "Nadia",
    "Kawtar", "Mariam", "Chaimae", "Aya", "Yasmine", "Fatima Zahra", "Khadija",
    "Meryem", "Rim", "Nezha", "Loubna", "Siham", "Btissam", "Soukaina", "Amina",
    "Houda", "Naima", "Sanae", "Zineb", "Oumaima", "Hanane", "Wafaa", "Nawal",
    "Bouchra", "Karima", "Latifa", "Samira", "Dounia", "Ilham", "Malak", "Basma",
    "Rania", "Lamiae", "Nisrine", "Zakia", "Fadwa", "Manal", "Hasna", "Souad",
    "Rajae", "Assia", "Nada", "Jihane", "Kenza", "Widad", "Chaima", "Salwa",
]

FAMILY_NAMES = [
    "El Mansouri", "Benjelloun", "Alaoui", "Berrada", "Tazi", "Chraibi", "Amrani",
    "Bennani", "Idrissi", "Filali", "El Fassi", "Lahlou", "Tahiri", "Haddad",
    "Belkadi", "Kabbaj", "Naciri", "Sbai", "Ouazzani", "Cherkaoui", "Bennis",
    "Belhaj", "Ait Ali", "El Idrissi", "Benali", "El Amrani", "Sekkat", "Guessous",
    "Lamrani", "Benkirane", "Bouzoubaa", "El Ghazali", "Zniber", "Skalli", "Rahali",
    "Benslimane", "El Yousfi", "Bourkia", "Hamdaoui", "Moujahid", "Sabri",
    "Zerouali", "El Khattabi", "Boukhris", "Daoudi", "Mekouar", "Sqalli",
    "Benabdallah", "Chakir", "El Harti", "Bahri", "Nejjar", "El Malki", "Ait Lahcen",
    "Ouhadi", "Bencheikh", "Lazrak", "Slaoui", "Tounsi", "Regragui", "El Kadiri",
    "Bennouna", "Hajji", "Marrakchi", "El Alami", "Serghini", "Boutaleb", "Zaoui",
    "Ammor", "Belmekki", "Chaoui", "Dahbi", "El Ouali", "Fadili", "Ghallab",
    "Hakimi", "Ibrahimi", "Jebbour", "Kettani", "Laraki", "Mrini", "Nassiri",
    "Ouakrim", "Rifai", "Saidi", "Talbi", "Wahbi", "Yacoubi", "Zemmouri",
    "Aboulkacem", "Barkaoui", "Chafik", "Doukkali", "Essadiki", "Fathallah",
]

#: Full names deliberately excluded so a random draw cannot land on a widely
#: recognisable public figure. Matched case-insensitively on "First Last".
BLOCKED_FULL_NAMES = {
    "abdelilah benkirane",
    "saad eddine el othmani",
    "walid regragui",
    "achraf hakimi",
    "hakim ziyech",
    "yassine bounou",
    "nasser bourita",
    "aziz akhannouch",
    "mohamed benkirane",
    "salaheddine mezouar",
}

# ── Business vocabularies ───────────────────────────────────────────────────

#: Leave reasons per LeaveType (leave-service supports ANNUAL / SICK / UNPAID only).
LEAVE_REASONS = {
    "ANNUAL": [
        "Congé annuel", "Vacances familiales", "Congé d'été", "Pont de fin de semaine",
        "Congé annuel — voyage", "Repos annuel planifié", "Congé annuel de fin d'année",
        "Congé annuel (solde restant)", "Vacances scolaires des enfants",
    ],
    "SICK": [
        "Arrêt maladie", "Certificat médical fourni", "Grippe saisonnière",
        "Consultation médicale et repos prescrit", "Intervention médicale programmée",
        "Repos médical", "Arrêt maladie — suite consultation",
    ],
    "UNPAID": [
        "Congé sans solde — raisons personnelles", "Convenance personnelle",
        "Congé exceptionnel sans solde", "Absence pour affaires personnelles",
        "Congé sans solde — formation externe",
    ],
}

#: Expense descriptions per ExpenseCategory (TRAVEL / MEALS / ACCOMMODATION /
#: SUPPLIES / TRAINING / OTHER — the enum the schema constrains to).
EXPENSE_DESCRIPTIONS = {
    "TRAVEL": [
        "Déplacement Casablanca — Rabat (client)", "Billet de train Casa Voyageurs — Tanger",
        "Vol Casablanca — Paris (réunion client)", "Taxi aéroport Mohammed V",
        "Déplacement site client Marrakech", "Carburant — tournée commerciale régionale",
        "Location de véhicule — mission Agadir", "Vol Casablanca — Madrid (comité projet)",
        "Péage et carburant — Casablanca / Kénitra",
    ],
    "MEALS": [
        "Déjeuner d'affaires avec le client", "Repas d'équipe — clôture de sprint",
        "Déjeuner en mission à Rabat", "Dîner d'affaires — prospect grand compte",
        "Repas lors du déplacement Tanger", "Pause-déjeuner atelier de cadrage",
        "Déjeuner comité de pilotage",
    ],
    "ACCOMMODATION": [
        "Hôtel 2 nuits — mission Tanger", "Hébergement séminaire Marrakech",
        "Hôtel — audit client Agadir", "Nuitée Rabat — réunion ministère client",
        "Hébergement 3 nuits — déploiement sur site",
    ],
    "SUPPLIES": [
        "Fournitures de bureau — agence Casablanca", "Câbles et adaptateurs poste de travail",
        "Casque audio pour visioconférence", "Papeterie et consommables imprimante",
        "Disque SSD externe — sauvegarde projet", "Clavier et souris de remplacement",
    ],
    "TRAINING": [
        "Formation Kubernetes — certification", "Inscription conférence DevOps Maroc",
        "Certification ISTQB Foundation", "Formation Power BI avancé",
        "Abonnement plateforme e-learning (1 an)", "Formation sécurité offensive",
        "Certification AWS Solutions Architect",
    ],
    "OTHER": [
        "Frais de représentation client", "Frais bancaires sur virement international",
        "Impression de supports commerciaux", "Frais de visa mission Europe",
        "Adhésion association professionnelle",
    ],
}

#: Additional document categories layered on top of the three Flyway-seeded ones
#: (General/EMPLOYEE, HR Confidential/HR, Payroll/ADMIN). Name, description,
#: min_role — the existing `document_category` contract, nothing new.
EXTRA_DOCUMENT_CATEGORIES = [
    ("Contrats & Avenants", "Contrats de travail, avenants et documents contractuels — RH et Admin.", "HR"),
    ("Attestations", "Attestations de travail, de salaire et de stage remises aux collaborateurs.", "EMPLOYEE"),
    ("Politiques Internes", "Politiques, chartes et procédures internes applicables à tous les collaborateurs.", "EMPLOYEE"),
]

#: Personal document templates: (title pattern, category name, extension, content type).
PERSONAL_DOCUMENT_TEMPLATES = [
    ("Contrat de travail — CDI", "Contrats & Avenants", "pdf", "application/pdf"),
    ("Avenant au contrat de travail", "Contrats & Avenants", "pdf", "application/pdf"),
    ("Attestation de travail", "Attestations", "pdf", "application/pdf"),
    ("Attestation de salaire", "Attestations", "pdf", "application/pdf"),
    ("Certificat de formation", "Attestations", "pdf", "application/pdf"),
    ("Entretien annuel d'évaluation", "HR Confidential", "pdf", "application/pdf"),
    ("Bulletin de paie — récapitulatif annuel", "Payroll", "pdf", "application/pdf"),
    ("Justificatif de frais de mission", "General", "pdf", "application/pdf"),
    ("Pièce jointe — demande de congé", "General", "pdf", "application/pdf"),
]

#: Company-wide documents (owner_keycloak_id NULL): (title, category, extension, content type).
COMPANY_DOCUMENTS = [
    ("Règlement intérieur", "Politiques Internes", "pdf", "application/pdf"),
    ("Charte informatique et usage des systèmes d'information", "Politiques Internes", "pdf", "application/pdf"),
    ("Politique de sécurité des systèmes d'information", "Politiques Internes", "pdf", "application/pdf"),
    ("Politique de télétravail", "Politiques Internes", "pdf", "application/pdf"),
    ("Procédure de gestion des congés", "Politiques Internes", "pdf", "application/pdf"),
    ("Procédure de note de frais", "Politiques Internes", "pdf", "application/pdf"),
    ("Charte de protection des données personnelles (loi 09-08)", "Politiques Internes", "pdf", "application/pdf"),
    ("Guide d'accueil des nouveaux collaborateurs", "General", "pdf", "application/pdf"),
    ("Organigramme du groupe", "General", "pdf", "application/pdf"),
    ("Calendrier des jours fériés", "General", "csv", "text/csv"),
    ("Annuaire des sites et contacts internes", "General", "csv", "text/csv"),
    ("Plan de formation annuel", "General", "pdf", "application/pdf"),
    ("Politique de rémunération et avantages sociaux", "HR Confidential", "pdf", "application/pdf"),
    ("Grille des classifications et niveaux", "HR Confidential", "pdf", "application/pdf"),
    ("Barème des indemnités de déplacement", "Payroll", "pdf", "application/pdf"),
]
