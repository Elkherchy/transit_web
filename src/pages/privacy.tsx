import Head from 'next/head';

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>Politique de Confidentialité — Emama Group</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="robots" content="index, follow" />
      </Head>

      <main
        lang="fr"
        dir="ltr"
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '24px 20px 64px',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: '#111',
          lineHeight: 1.6,
          fontSize: 16,
          textAlign: 'left',
        }}
      >
        <h1 style={{ fontSize: 26, marginBottom: 4 }}>Politique de Confidentialité — Emama Group</h1>
        <p style={{ color: '#666', marginTop: 0 }}>Dernière mise à jour : 12 mai 2025</p>

        <h2 style={{ fontSize: 20, marginTop: 28 }}>1. Présentation</h2>
        <p>
          Emama Group est une application mobile interne (WebView) destinée exclusivement aux
          collaborateurs et partenaires autorisés d&apos;Emama Group. Elle donne accès au système
          d&apos;information interne de l&apos;entreprise.
        </p>

        <h2 style={{ fontSize: 20, marginTop: 28 }}>2. Données collectées</h2>
        <p>
          L&apos;application ne collecte aucune donnée personnelle à des fins commerciales ou
          publicitaires. Les seules données traitées sont les identifiants de connexion (nom
          d&apos;utilisateur et mot de passe) fournis par l&apos;administrateur Emama Group, utilisés
          uniquement pour authentifier l&apos;utilisateur sur le système interne.
        </p>

        <h2 style={{ fontSize: 20, marginTop: 28 }}>3. Utilisation des données</h2>
        <p>
          Les données d&apos;authentification sont utilisées uniquement pour permettre l&apos;accès au
          système interne. Aucune donnée n&apos;est partagée avec des tiers, des partenaires
          publicitaires ou des courtiers en données.
        </p>

        <h2 style={{ fontSize: 20, marginTop: 28 }}>4. Tracking et publicité</h2>
        <p>
          L&apos;application ne procède à aucun suivi (tracking) des utilisateurs. Aucune donnée
          n&apos;est utilisée à des fins publicitaires. Aucune régie publicitaire n&apos;est intégrée.
        </p>

        <h2 style={{ fontSize: 20, marginTop: 28 }}>5. Partage des données</h2>
        <p>
          Aucune donnée personnelle n&apos;est vendue, louée ou partagée avec des tiers extérieurs à
          Emama Group.
        </p>

        <h2 style={{ fontSize: 20, marginTop: 28 }}>6. Sécurité</h2>
        <p>
          Toutes les communications entre l&apos;application et le serveur sont chiffrées via HTTPS
          (TLS). L&apos;accès est contrôlé par un système de permissions par rôle et un journal
          d&apos;audit côté serveur.
        </p>

        <h2 style={{ fontSize: 20, marginTop: 28 }}>7. Accès et suppression</h2>
        <p>
          Tout collaborateur peut demander la suppression de son compte en contactant
          l&apos;administrateur système à :{' '}
          <a href="mailto:elkherchymd22025@gmail.com">elkherchymd22025@gmail.com</a>
        </p>

        <h2 style={{ fontSize: 20, marginTop: 28 }}>8. Mineurs</h2>
        <p>
          L&apos;application est exclusivement réservée aux professionnels. Elle n&apos;est pas destinée
          aux mineurs.
        </p>

        <h2 style={{ fontSize: 20, marginTop: 28 }}>9. Modifications</h2>
        <p>
          Cette politique peut être mise à jour. La date de dernière modification est indiquée en
          haut de cette page.
        </p>

        <h2 style={{ fontSize: 20, marginTop: 28 }}>10. Contact</h2>
        <p>
          📧{' '}
          <a href="mailto:elkherchymd22025@gmail.com">elkherchymd22025@gmail.com</a>
          <br />
          🌐{' '}
          <a href="https://emama-group-blue.vercel.app" target="_blank" rel="noreferrer">
            https://emama-group-blue.vercel.app
          </a>
        </p>
      </main>
    </>
  );
}
