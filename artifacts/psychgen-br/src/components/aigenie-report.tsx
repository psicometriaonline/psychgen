import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Leitura estruturada das métricas do Estágio 1.
 *
 * O relatório do AI-GENIE traz três níveis, e eles respondem perguntas
 * diferentes:
 *
 *  - `perType`   — uma análise por dimensão declarada, rodada isoladamente.
 *  - `overall`   — um único EGA sobre o pool inteiro. É o único lugar onde a
 *                  numeração de comunidades é comparável entre dimensões.
 *  - `communityComposition` — a tabulação comunidade × atributo desse EGA
 *                  geral. É a evidência direta de que a estrutura recuperada
 *                  bate (ou não) com o gabarito declarado.
 */

type PerType = {
  type?: string;
  startN?: number | null;
  finalN?: number | null;
  initialNMI?: number | null;
  finalNMI?: number | null;
  egaModel?: string | null;
  uvaRemoved?: number | null;
  bootEgaRemoved?: number | null;
  meanItemStability?: number | null;
  minItemStability?: number | null;
  itensAbaixoDoCorte?: number | null;
};

type Composicao = {
  community?: number;
  nItems?: number;
  dominantAttribute?: string | null;
  attributePurity?: number | null;
  dominantType?: string | null;
  typePurity?: number | null;
  nAttributes?: number | null;
};

export type AigenieMetrics = {
  aigenie?: {
    mode?: string;
    packageVersion?: string;
    embeddingModel?: string;
    egaModel?: string;
    egaAlgorithm?: string;
    targetN?: number;
    startN?: number;
    finalN?: number;
    meanInitialNMI?: number | null;
    meanFinalNMI?: number | null;
  };
  perType?: PerType[];
  overall?: {
    initialNMI?: number | null;
    finalNMI?: number | null;
    egaModel?: string | null;
    startN?: number | null;
    finalN?: number | null;
  };
  communityComposition?: Composicao[];
};

const nm = (v: number | null | undefined, casas = 4) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(casas);

const pct = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(0)}%`;

function corDaPureza(p: number | null | undefined): string {
  if (p == null) return "";
  if (p >= 0.8) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  if (p >= 0.6) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
}

function Delta({ de, para }: { de?: number | null; para?: number | null }) {
  if (de == null || para == null) return <span className="text-muted-foreground">—</span>;
  const d = para - de;
  const cor =
    d > 0.0001 ? "text-green-700 dark:text-green-400"
    : d < -0.0001 ? "text-red-700 dark:text-red-400"
    : "text-muted-foreground";
  return (
    <span className={cor}>
      {d >= 0 ? "+" : ""}
      {d.toFixed(4)}
    </span>
  );
}

export function AigenieReport({ metrics }: { metrics: AigenieMetrics }) {
  const { aigenie, perType, overall, communityComposition } = metrics;
  const temAlgo =
    aigenie || (perType && perType.length) || overall || (communityComposition && communityComposition.length);
  if (!temAlgo) return null;

  return (
    <div className="space-y-6">
      {aigenie && (
        <Card>
          <CardHeader>
            <CardTitle>Como a análise foi rodada</CardTitle>
            <CardDescription>
              Parâmetros efetivamente usados pelo pacote — não os que foram pedidos na tela.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                ["Modo", aigenie.mode === "validate" ? "validação (GENIE)" : "geração (AIGENIE)"],
                ["Versão do pacote", aigenie.packageVersion],
                ["Embeddings", aigenie.embeddingModel],
                ["Modelo de rede", aigenie.egaModel],
                ["Algoritmo", aigenie.egaAlgorithm],
                ["Alvo por dimensão", aigenie.targetN],
                ["Itens gerados", aigenie.startN],
                ["Itens finais", aigenie.finalN],
              ].map(([rotulo, valor]) => (
                <div key={String(rotulo)}>
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">{rotulo}</dt>
                  <dd className="font-medium mt-0.5">{valor ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {overall && (overall.finalNMI != null || overall.initialNMI != null) && (
        <Card>
          <CardHeader>
            <CardTitle>Pool completo</CardTitle>
            <CardDescription>
              Um único EGA sobre todos os itens juntos. O NMI compara as comunidades
              encontradas com os <strong>atributos declarados</strong> — não com as dimensões.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">NMI inicial</dt>
                <dd className="font-medium mt-0.5 tabular-nums">{nm(overall.initialNMI)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">NMI final</dt>
                <dd className="font-medium mt-0.5 tabular-nums">{nm(overall.finalNMI)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">Ganho</dt>
                <dd className="font-medium mt-0.5 tabular-nums">
                  <Delta de={overall.initialNMI} para={overall.finalNMI} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">Modelo usado</dt>
                <dd className="font-medium mt-0.5">{overall.egaModel ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">Itens</dt>
                <dd className="font-medium mt-0.5 tabular-nums">
                  {overall.startN ?? "—"} → {overall.finalN ?? "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {communityComposition && communityComposition.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Comunidades × atributos</CardTitle>
            <CardDescription>
              Para cada comunidade encontrada, qual atributo predomina e com que pureza.
              Pureza alta significa que a comunidade <em>é</em> aquele atributo; pureza
              baixa significa que facetas distintas colapsaram numa só.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Comunidade</TableHead>
                    <TableHead className="w-20">Itens</TableHead>
                    <TableHead>Atributo dominante</TableHead>
                    <TableHead className="w-24">Pureza</TableHead>
                    <TableHead>Dimensão dominante</TableHead>
                    <TableHead className="w-24">Pureza</TableHead>
                    <TableHead className="w-28">Nº atributos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {communityComposition.map((c, i) => (
                    <TableRow key={c.community ?? i}>
                      <TableCell className="font-mono">{c.community ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{c.nItems ?? "—"}</TableCell>
                      <TableCell>{c.dominantAttribute ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={corDaPureza(c.attributePurity)}>
                          {pct(c.attributePurity)}
                        </Badge>
                      </TableCell>
                      <TableCell>{c.dominantType ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={corDaPureza(c.typePurity)}>
                          {pct(c.typePurity)}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{c.nAttributes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {perType && perType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Por dimensão</CardTitle>
            <CardDescription>
              Cada dimensão passou pelo pipeline separadamente. Estabilidade abaixo de
              0,75 não deveria sobrar após a redução do bootEGA.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dimensão</TableHead>
                    <TableHead className="w-24">Itens</TableHead>
                    <TableHead className="w-28">NMI inicial</TableHead>
                    <TableHead className="w-28">NMI final</TableHead>
                    <TableHead className="w-24">Ganho</TableHead>
                    <TableHead className="w-24">UVA</TableHead>
                    <TableHead className="w-24">bootEGA</TableHead>
                    <TableHead className="w-32">Estab. média</TableHead>
                    <TableHead className="w-32">Estab. mínima</TableHead>
                    <TableHead className="w-24">Modelo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perType.map((t, i) => (
                    <TableRow key={t.type ?? i}>
                      <TableCell className="font-medium">{t.type ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {t.startN ?? "—"} → {t.finalN ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">{nm(t.initialNMI)}</TableCell>
                      <TableCell className="tabular-nums">{nm(t.finalNMI)}</TableCell>
                      <TableCell className="tabular-nums">
                        <Delta de={t.initialNMI} para={t.finalNMI} />
                      </TableCell>
                      <TableCell className="tabular-nums">−{t.uvaRemoved ?? 0}</TableCell>
                      <TableCell className="tabular-nums">−{t.bootEgaRemoved ?? 0}</TableCell>
                      <TableCell className="tabular-nums">{nm(t.meanItemStability, 3)}</TableCell>
                      <TableCell className="tabular-nums">
                        {nm(t.minItemStability, 3)}
                        {t.itensAbaixoDoCorte != null && t.itensAbaixoDoCorte > 0 && (
                          <Badge
                            variant="outline"
                            className="ml-2 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                          >
                            {t.itensAbaixoDoCorte} abaixo de 0,75
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{t.egaModel ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
