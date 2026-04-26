import { useState } from "react";
import { ChevronLeft, Smartphone } from "lucide-react";
import type { Equipe, UsuarioLogado } from "../App";
import { API_BASE_URL, salvarToken } from "../lib/api";

type Props = {
  equipe: Equipe | null;
  voltar: () => void;
  onLogin: (usuario: UsuarioLogado) => void;
};

export default function Login({ equipe, voltar, onLogin }: Props) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function fazerLogin() {
    try {
      setErro("");
      setCarregando(true);

      const resposta = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user, password }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setErro(dados.erro || "Erro ao fazer login");
        return;
      }

      salvarToken(dados.token);
      onLogin({ ...dados.usuario, token: dados.token });
    } catch (error) {
      console.error(error);
      setErro("Não foi possível conectar com a API");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          overflow: "hidden",
          background: "#f8fafc",
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(90deg, #021B33 0%, #0A3A63 50%, #0B5C7A 100%)",
            color: "white",
            padding: "20px 20px 24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <button
              onClick={voltar}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                border: "none",
                background: "rgba(255,255,255,0.12)",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <ChevronLeft  size={22} />
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                background: "rgba(255,255,255,0.12)",
                padding: "6px 12px",
                fontSize: 12,
              }}
            >
              <Smartphone size={14} />
              APP Campo
            </div>
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              color: "#ffffff",
            }}
          >
            Login da equipe
          </h1>

          <div
            style={{
              marginTop: 6,
              fontSize: 14,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            Acesse com seu usuário e senha
          </div>
        </div>

        <div
          style={{
            padding: 16,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 28,
              padding: 16,
              boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
              maxWidth: 520,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                background: "#f1f5f9",
                borderRadius: 16,
                padding: 14,
                color: "#475569",
                fontSize: 14,
                marginBottom: 16,
              }}
            >
            <p style={{ marginBottom: 10 }}>
              Equipe selecionada: <strong>{equipe?.numero_equipe}</strong>
            </p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <input
                placeholder="Usuário"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 16,
                  border: "1px solid #cbd5e1",
                  padding: "0 14px",
                  fontSize: 15,
                  boxSizing: "border-box",
                  outline: "none",
                  background: "white",
                }}
              />

              <input
                placeholder="Senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 16,
                  border: "1px solid #cbd5e1",
                  padding: "0 14px",
                  fontSize: 15,
                  boxSizing: "border-box",
                  outline: "none",
                  background: "white",
                }}
              />

              {erro ? (
                <div
                  style={{
                    background: "#fee2e2",
                    color: "#b91c1c",
                    padding: 12,
                    borderRadius: 14,
                    fontSize: 14,
                  }}
                >
                  {erro}
                </div>
              ) : null}

              <button
                onClick={fazerLogin}
                disabled={carregando}
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 16,
                  border: "none",
                  background: "#0A3A63",
                  color: "white",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {carregando ? "Entrando..." : "Entrar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
