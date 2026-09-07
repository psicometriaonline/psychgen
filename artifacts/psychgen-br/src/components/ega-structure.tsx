import { useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network } from "lucide-react";

/**
 * Agrupamento dos itens pelas comunidades encontradas pelo EGA.
 *
 * A comunidade (`egaCommunity`) é o que o método *descobriu* a partir dos
 * embeddings; o atributo (`attribute`) é o que foi *declarado* no formulário e
 * serve de gabarito. O NMI do AI-GENIE compara exatamente essas duas colunas,
 * então ver os itens lado a lado é a leitura qualitativa do mesmo número.
 *
 * A pureza é calculada aqui a partir dos próprios itens (fração da comunidade
 * que vem do atributo dominante) em vez de vir do relatório, para que a tela
 * continue funcionando em projetos cujo relatório é anterior a essa métrica.
 */

type ItemLike = {
  id: number;
  text: string;
  attribute?: string | null;
  dimension?: string | null;
  egaCommunity?: number | null;
  status: string;
};

type Comunidade = {
  community: number;
  itens: ItemLike[];
  atributoDominante: string;
  pureza: number;
  contagemAtributos: [string, number][];
};

function agrupar(itens: ItemLike[]): Comunidade[] {
  const porComunidade = new Map<number, ItemLike[]>();
  for (const it of itens) {
    if (it.egaCommunity == null) continue;
    const atual = porComunidade.get(it.egaCommunity);
    if (atual) atual.push(it);
    else porComunidade.set(it.egaCommunity, [it]);
  }

  return [...porComunidade.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([community, grupo]) => {
      const contagem = new Map<string, number>();
      for (const it of grupo) {
        const chave = it.attribute?.trim() || "(sem atributo)";
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
      }
      const ordenado = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
      const [dominante, n] = ordenado[0] ?? ["(sem atributo)", 0];
      return {
        community,
        itens: grupo,
        atributoDominante: dominante,
        pureza: grupo.length > 0 ? n / grupo.length : 0,
        contagemAtributos: ordenado,
      };
    });
}

function corDaPureza(p: number): string {
  if (p >= 0.8) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  if (p >= 0.6) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
}

export function EgaStructure({
  items,
  projectId,
}: {
  items: ItemLike[];
  projectId: number;
}) {
  const comunidades = useMemo(() => agrupar(items), [items]);
  const semComunidade = useMemo(
    () => items.filter((i) => i.egaCommunity == null),
    [items],
  );

  if (comunidades.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Network className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhuma comunidade do EGA registrada ainda.</p>
          <p className="text-sm mt-1">
            As comunidades aparecem aqui depois de rodar o Estágio 1 (AI-GENIE).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Cada bloco é uma <strong>comunidade</strong> que o EGA encontrou nos
        embeddings — o agrupamento que o método <em>descobriu</em>. O{" "}
        <strong>atributo</strong> ao lado de cada item é o que <em>você declarou</em>{" "}
        no formulário. A pureza diz que fração da comunidade veio do atributo
        dominante: perto de 100% significa que a comunidade <em>é</em> aquele
        atributo; perto de 50% significa que duas facetas colapsaram numa só.
      </p>

      {comunidades.map((c) => (
        <Card key={c.community}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" />
                Comunidade {c.community}
                <span className="text-muted-foreground font-normal">
                  · {c.itens.length} {c.itens.length === 1 ? "item" : "itens"}
                </span>
              </CardTitle>
              <Badge variant="outline" className={corDaPureza(c.pureza)}>
                pureza {(c.pureza * 100).toFixed(0)}%
              </Badge>
            </div>
            <CardDescription>
              Atributo dominante: <strong>{c.atributoDominante}</strong>
              {c.contagemAtributos.length > 1 && (
                <>
                  {" · também contém "}
                  {c.contagemAtributos
                    .slice(1)
                    .map(([nome, n]) => `${nome} (${n})`)
                    .join(", ")}
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y">
              {c.itens.map((it) => {
                const foraDoDominante =
                  (it.attribute?.trim() || "(sem atributo)") !== c.atributoDominante;
                return (
                  <li key={it.id} className="py-2 flex items-start gap-3">
                    <Link
                      href={`/projects/${projectId}/items/${it.id}`}
                      className="font-mono text-xs text-muted-foreground pt-0.5 hover:underline shrink-0"
                    >
                      #{it.id}
                    </Link>
                    <span className="flex-1 text-sm">{it.text}</span>
                    <Badge
                      variant="outline"
                      className={
                        foraDoDominante
                          ? "shrink-0 border-amber-500/60 text-amber-700 dark:text-amber-300"
                          : "shrink-0"
                      }
                    >
                      {it.attribute?.trim() || "sem atributo"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}

      {semComunidade.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Sem comunidade
              <span className="text-muted-foreground font-normal">
                {" "}· {semComunidade.length}{" "}
                {semComunidade.length === 1 ? "item" : "itens"}
              </span>
            </CardTitle>
            <CardDescription>
              Itens que não entraram na análise final — tipicamente removidos pela
              UVA (redundância) ou pelo bootEGA (instabilidade), ou gerados antes
              de o registro de comunidade existir.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y">
              {semComunidade.map((it) => (
                <li key={it.id} className="py-2 flex items-start gap-3">
                  <Link
                    href={`/projects/${projectId}/items/${it.id}`}
                    className="font-mono text-xs text-muted-foreground pt-0.5 hover:underline shrink-0"
                  >
                    #{it.id}
                  </Link>
                  <span className="flex-1 text-sm text-muted-foreground">{it.text}</span>
                  <Badge variant="outline" className="shrink-0">
                    {it.attribute?.trim() || "sem atributo"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
