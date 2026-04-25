import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const en = {
  common: {
    appName: "Poulina AI Knowledge",
    appTagline: "Enterprise intelligence platform",
    signIn: "Sign in",
    signUp: "Create account",
    signOut: "Sign out",
    email: "Email",
    password: "Password",
    displayName: "Full name",
    language: "Language",
    english: "English",
    french: "Français",
    continue: "Continue",
    cancel: "Cancel",
    save: "Save",
    search: "Search",
    loading: "Loading…",
    selectLanguage: "Select your language",
    selectLanguageHelp: "You can change this anytime in your profile.",
  },
  auth: {
    welcomeTitle: "Welcome back",
    welcomeSubtitle: "Sign in to access the knowledge platform",
    createTitle: "Create your account",
    createSubtitle: "Join the Poulina knowledge platform",
    haveAccount: "Already have an account?",
    noAccount: "Don't have an account?",
    invalid: "Invalid email or password",
    signupSuccess: "Account created — you're signed in.",
  },
  nav: {
    dashboard: "Dashboard",
    documentation: "Documentation",
    ask: "AI Ask",
    settings: "Settings",
  },
  dashboard: {
    greeting: "Good to see you",
    askPlaceholder: "Ask anything about the platform, deployment, or troubleshooting…",
    askHint: "Powered by retrieval-augmented AI · grounded in your documentation",
    quickStart: "Quick start",
    recentDocs: "Documentation categories",
    submit: "Ask",
  },
  docs: {
    title: "Documentation",
    subtitle: "Structured guides organized by domain",
    categories: {
      monitoring: "Monitoring",
      proxy: "Proxy",
      users: "Users",
      database: "Database",
      ai: "AI Engine",
      troubleshooting: "Troubleshooting",
    },
    empty: "No documents yet in this category.",
    backToDocs: "Back to documentation",
  },
  ai: {
    title: "AI Ask",
    sourcesLabel: "Sources",
    thinking: "Thinking…",
    error: "Something went wrong. Please try again.",
  },
  theme: { light: "Light", dark: "Dark", system: "System" },
};

const fr: typeof en = {
  common: {
    appName: "Poulina AI Knowledge",
    appTagline: "Plateforme d'intelligence d'entreprise",
    signIn: "Se connecter",
    signUp: "Créer un compte",
    signOut: "Se déconnecter",
    email: "E-mail",
    password: "Mot de passe",
    displayName: "Nom complet",
    language: "Langue",
    english: "English",
    french: "Français",
    continue: "Continuer",
    cancel: "Annuler",
    save: "Enregistrer",
    search: "Rechercher",
    loading: "Chargement…",
    selectLanguage: "Choisissez votre langue",
    selectLanguageHelp: "Vous pourrez la modifier à tout moment.",
  },
  auth: {
    welcomeTitle: "Bon retour",
    welcomeSubtitle: "Connectez-vous pour accéder à la plateforme",
    createTitle: "Créer votre compte",
    createSubtitle: "Rejoignez la plateforme de connaissances Poulina",
    haveAccount: "Déjà un compte ?",
    noAccount: "Pas encore de compte ?",
    invalid: "E-mail ou mot de passe invalide",
    signupSuccess: "Compte créé — vous êtes connecté.",
  },
  nav: {
    dashboard: "Tableau de bord",
    documentation: "Documentation",
    ask: "Assistant IA",
    settings: "Paramètres",
  },
  dashboard: {
    greeting: "Heureux de vous revoir",
    askPlaceholder: "Posez une question sur la plateforme, le déploiement ou le dépannage…",
    askHint: "Propulsé par l'IA augmentée · ancré dans votre documentation",
    quickStart: "Démarrage rapide",
    recentDocs: "Catégories de documentation",
    submit: "Demander",
  },
  docs: {
    title: "Documentation",
    subtitle: "Guides structurés organisés par domaine",
    categories: {
      monitoring: "Supervision",
      proxy: "Proxy",
      users: "Utilisateurs",
      database: "Base de données",
      ai: "Moteur IA",
      troubleshooting: "Dépannage",
    },
    empty: "Aucun document dans cette catégorie.",
    backToDocs: "Retour à la documentation",
  },
  ai: {
    title: "Assistant IA",
    sourcesLabel: "Sources",
    thinking: "Réflexion…",
    error: "Une erreur est survenue. Veuillez réessayer.",
  },
  theme: { light: "Clair", dark: "Sombre", system: "Système" },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, fr: { translation: fr } },
    fallbackLng: "en",
    supportedLngs: ["en", "fr"],
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
  });

export default i18n;
