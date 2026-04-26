import { Smartphone } from "lucide-react";

type Props = {
  entrar: () => void;
};

export default function Splash({ entrar }: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #021B33 0%, #0A3A63 50%, #0B5C7A 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 32,
        color: "white",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 28,
          background: "rgba(255,255,255,0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 20px 40px rgba(2,6,23,0.25)",
          marginBottom: 24,
        }}
      >
        <Smartphone size={44} />
      </div>

      <h1
        style={{
          fontSize: 42,
          fontWeight: 900,
          margin: 0,
          color: "#ffffff",
        }}
      >
        FieldPro
      </h1>

      <p
        style={{
          marginTop: 12,
          maxWidth: 280,
          color: "rgba(255,255,255,0.88)",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Aplicativo da equipe para demandas, mapa, fotos, rota e sincronização offline.
      </p>

      <button
        onClick={entrar}
        style={{
          marginTop: 28,
          border: "none",
          borderRadius: 999,
          background: "#ffffff",
          color: "#0A3A63",
          height: 42,
          padding: "0 22px",
          fontWeight: 700,
          fontSize: 15,
          cursor: "pointer",
          boxShadow: "0 8px 20px rgba(2,6,23,0.18)",
        }}
      >
        Entrar no APP
      </button>
    </div>
  );
}