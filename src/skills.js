// Skills dictionary used to compare a resume with a job description.
// Format per entry: "Canonical name|alias|alias". Matching is case-insensitive and whole-word.
// Ambiguous one-letter languages (C, R, Go) are only matched through unambiguous aliases.

import { escapeRegex } from './text.js';

const RAW = {
  'Programming languages': [
    'Python', 'Java', 'JavaScript|javascript|ecmascript|es6', 'TypeScript', 'C++|cpp', 'C#|c sharp|csharp', 'Go|golang',
    'Rust', 'Ruby', 'PHP', 'Kotlin', 'Swift|swiftui', 'Objective-C|objective c', 'Scala', 'R|r programming|rstudio|r studio|tidyverse',
    'MATLAB', 'Perl', 'Bash|shell scripting|bash scripting', 'PowerShell', 'Dart', 'Elixir', 'Haskell', 'Clojure', 'Lua',
    'VBA', 'COBOL', 'Fortran', 'Embedded C|embedded c', 'Verilog', 'VHDL', 'Solidity', 'Groovy',
  ],
  'Web & mobile': [
    'React|react.js|reactjs', 'Angular|angularjs', 'Vue.js|vue|vuejs|nuxt', 'Next.js|nextjs', 'Svelte', 'Node.js|nodejs',
    'Express.js|express.js|expressjs', 'HTML|html5', 'CSS|css3|sass|scss', 'Tailwind CSS|tailwind', 'Redux', 'GraphQL',
    'REST APIs|restful|rest api|rest apis|restful apis|rest services', 'gRPC', 'WebSockets|websocket', 'jQuery',
    'React Native', 'Flutter', 'Android', 'iOS', 'Django', 'Flask', 'FastAPI', 'Spring Boot|spring boot|spring framework',
    'Ruby on Rails|rails', 'Laravel', '.NET|dotnet|.net core|asp.net', 'Webpack|vite', 'Accessibility|wcag|a11y',
    'Microservices|microservice', 'Web performance|core web vitals',
  ],
  'Data & AI': [
    'SQL', 'PostgreSQL|postgres', 'MySQL', 'SQL Server|mssql|t-sql|tsql', 'Oracle', 'MongoDB', 'Redis', 'Cassandra',
    'DynamoDB', 'Elasticsearch|opensearch', 'Snowflake', 'BigQuery', 'Redshift', 'Databricks', 'Apache Spark|spark|pyspark',
    'Hadoop', 'Kafka', 'Airflow', 'dbt', 'ETL|elt|data pipelines|data pipeline', 'Data warehousing|data warehouse|data warehousing',
    'Data modelling|data modeling|data modelling', 'Pandas', 'NumPy', 'scikit-learn|sklearn|scikit learn', 'TensorFlow',
    'PyTorch', 'Keras', 'Machine learning|machine learning|ml engineering', 'Deep learning|deep learning|neural networks',
    'NLP|natural language processing', 'Computer vision', 'LLMs|llm|large language models|generative ai|genai',
    'MLOps', 'Statistics|statistical analysis|statistical modelling|statistical modeling', 'A/B testing|ab testing|experimentation',
    'Data visualisation|data visualization|data visualisation', 'Tableau', 'Power BI|powerbi', 'Looker', 'Qlik',
    'Excel|microsoft excel|ms excel|advanced excel', 'Data analysis|data analysis|data analytics|data analyst', 'Jupyter',
    'SAS', 'SPSS', 'Hugging Face|huggingface', 'Recommender systems|recommendation systems',
  ],
  'Cloud & DevOps': [
    'AWS|amazon web services', 'Azure|microsoft azure', 'GCP|google cloud|google cloud platform', 'Docker', 'Kubernetes|k8s',
    'Terraform', 'Ansible', 'Helm', 'CI/CD|ci/cd|continuous integration|continuous delivery|continuous deployment',
    'Jenkins', 'GitHub Actions', 'GitLab CI|gitlab', 'Git', 'Linux|unix', 'Prometheus', 'Grafana', 'Datadog',
    'Site reliability|sre|site reliability', 'Infrastructure as code|infrastructure as code|iac', 'Serverless|lambda',
    'Networking|tcp/ip|dns|networking', 'Observability|monitoring', 'Nginx', 'CloudFormation', 'Pulumi',
  ],
  'Security': [
    'Cybersecurity|cyber security|cybersecurity|information security|infosec', 'Penetration testing|pen testing|penetration testing',
    'SIEM|splunk', 'IAM|identity and access management', 'ISO 27001', 'SOC 2|soc2', 'GDPR', 'OWASP', 'Threat modelling|threat modeling|threat modelling',
    'Incident response', 'Vulnerability management', 'Cryptography|encryption',
  ],
  'Engineering practice': [
    'System design|system design|distributed systems', 'Object-oriented design|oop|object oriented|object-oriented',
    'Unit testing|unit testing|unit tests|tdd|test driven', 'Test automation|test automation|automated testing|selenium|cypress|playwright',
    'Agile|agile|scrum|kanban', 'Jira', 'Code review|code reviews', 'Algorithms|algorithms|data structures', 'API design',
    'Performance tuning|performance optimisation|performance optimization', 'Embedded systems|embedded systems|firmware|rtos',
    'QA|quality assurance', 'Technical writing|technical documentation', 'Mentoring|mentoring|mentorship|coaching',
  ],
  'Product & design': [
    'Product management|product management|product manager|product roadmap', 'Roadmapping|roadmap', 'User research|user research|usability testing',
    'UX design|ux|user experience', 'UI design|ui design|user interface', 'Figma', 'Sketch', 'Adobe Creative Suite|photoshop|illustrator|indesign|adobe creative',
    'Prototyping|prototyping|wireframing|wireframes', 'Design systems|design system', 'Product analytics|amplitude|mixpanel',
    'Stakeholder management|stakeholder management|stakeholders', 'OKRs|okr', 'Go-to-market|go-to-market|gtm',
  ],
  'Business, finance & legal': [
    'Financial modelling|financial modelling|financial modeling', 'Accounting|accounting|bookkeeping', 'ACCA', 'ACA|chartered accountant',
    'CIMA', 'CFA', 'IFRS', 'US GAAP|gaap', 'Audit|audit|auditing', 'Tax|taxation|tax', 'Budgeting|budgeting|forecasting',
    'FP&A|fp&a|financial planning', 'Accounts payable|accounts payable', 'Accounts receivable|accounts receivable', 'Payroll',
    'SAP', 'Oracle Financials|oracle financials', 'NetSuite', 'Xero', 'Sage', 'Risk management|risk management', 'Compliance|compliance|regulatory',
    'AML|anti-money laundering|kyc', 'Fund accounting|fund accounting|fund administration', 'Treasury', 'Investment banking|m&a',
    'Contract law|contract negotiation|contracts', 'Procurement|procurement|purchasing', 'Supply chain|supply chain|logistics',
    'Business analysis|business analysis|business analyst|requirements gathering', 'Project management|project management|pmp|prince2',
    'Change management', 'Process improvement|process improvement|lean|six sigma|continuous improvement',
  ],
  'Sales, marketing & customer': [
    'B2B sales|b2b', 'SaaS', 'Account management|account management|account manager', 'Business development|business development',
    'Salesforce|salesforce crm', 'HubSpot', 'CRM', 'Lead generation|lead generation|prospecting', 'Negotiation', 'Customer success|customer success',
    'Customer support|customer support|customer service', 'Zendesk', 'Digital marketing|digital marketing', 'SEO', 'SEM|ppc|google ads|paid search',
    'Content marketing|content marketing|copywriting', 'Social media|social media', 'Email marketing|email marketing|marketing automation|marketo',
    'Google Analytics|google analytics|ga4', 'Brand management|brand management|branding', 'Market research', 'Public relations|public relations|media relations',
    'Event management|event management|event planning', 'Partnerships|partnerships|channel sales', 'Solutions engineering|solutions engineer|pre-sales|presales|sales engineer',
  ],
  'People & operations': [
    'Recruitment|recruitment|recruiting|talent acquisition', 'HR|human resources|hr', 'Employee relations', 'Learning and development|l&d|learning and development',
    'Compensation and benefits|compensation and benefits|reward and benefits', 'Workday', 'Operations management|operations management|business operations',
    'Vendor management|vendor management', 'Office management|office management|facilities', 'Data entry', 'Administration|administration|administrative',
    'Microsoft Office|microsoft office|ms office|office 365|microsoft 365|powerpoint', 'Google Workspace|g suite|google workspace',
    'Leadership|leadership|people management|line management', 'Training delivery|training delivery|delivering training',
  ],
  'Science, health & manufacturing': [
    'GMP|gmp|good manufacturing practice', 'GxP', 'Validation|validation|cqv|iq/oq/pq', 'Quality control|quality control|qc',
    'Quality management|quality management|qms|iso 9001', 'Regulatory affairs|regulatory affairs', 'Clinical trials|clinical trials|clinical research|good clinical practice',
    'Pharmacovigilance', 'Biotechnology|biotech|biologics|bioprocessing', 'Chemistry|analytical chemistry|hplc', 'Microbiology',
    'Medical devices|medical device|iso 13485', 'Nursing|nurse|nursing|rgn', 'Patient care', 'Laboratory|laboratory|lab experience|lab techniques',
    'CAD|autocad|solidworks|cad', 'Mechanical engineering|mechanical engineering', 'Electrical engineering|electrical engineering',
    'Process engineering|process engineering', 'Manufacturing|manufacturing|production line|production planning', 'Automation|plc|scada|automation',
    'Health and safety|health and safety|ehs|osha', 'Root cause analysis|root cause|capa|rca', 'Semiconductors|semiconductor|wafer',
  ],
  'Languages': [
    'French|french', 'German|german', 'Spanish|spanish', 'Italian|italian', 'Dutch|dutch', 'Portuguese|portuguese', 'Polish|polish',
    'Irish language|gaeilge|irish language|irish speaker', 'Japanese|japanese', 'Mandarin|mandarin|chinese', 'Arabic|arabic', 'Nordic languages|swedish|danish|norwegian|finnish',
  ],
};

function buildMatcher(alias) {
  const a = alias.toLowerCase().trim();
  return new RegExp(`(?<![a-z0-9+#])${escapeRegex(a)}(?![a-z0-9+#]|\\.[a-z0-9])`, 'i');
}

export const SKILLS = Object.entries(RAW).flatMap(([category, entries]) =>
  entries.map((entry) => {
    const [name, ...aliases] = entry.split('|');
    // Single letters / generic words are only matched through their aliases.
    const SKIP_CANONICAL = new Set(['R', 'Go', 'Git']);
    const terms = aliases.length ? aliases : [name];
    if (aliases.length && !SKIP_CANONICAL.has(name)) terms.push(name);
    if (name === 'Git') terms.push('git');
    return { name, category, regexes: [...new Set(terms.map((t) => t.toLowerCase()))].map(buildMatcher) };
  }),
);

/** Return the canonical skill names found in the text. */
export function extractSkills(text = '') {
  const lower = String(text).toLowerCase();
  const found = [];
  for (const skill of SKILLS) {
    if (skill.regexes.some((re) => re.test(lower))) found.push(skill.name);
  }
  return found;
}

export function skillCategory(name) {
  return SKILLS.find((s) => s.name === name)?.category ?? 'Other';
}
