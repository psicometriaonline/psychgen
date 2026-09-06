/**
 * Verifica que os scripts R gerados por `r-syntax/` são sintaticamente
 * válidos — parseando-os com o R de verdade.
 *
 * Existe por causa de um bug que passou por typecheck, build e revisão, e só
 * apareceu quando o usuário rodou o pipeline: o cabeçalho comum aos quatro
 * estágios trazia
 *
 *     inp <- if (cond)
 *              jsonlite::fromJSON(...)
 *            else
 *              list()
 *
 * No nível superior de um script, o R encerra a expressão no fim do primeiro
 * ramo e trata o `else` seguinte como erro de sintaxe. Como o gerador produz
 * texto, o TypeScript não tem como pegar isso — só o parser do R pega.
 *
 * Uso:
 *   pnpm --filter @workspace/api-server run check-r-syntax
 *
 * Precisa de `Rscript` no PATH. Sem R instalado localmente, dá para rodar
 * dentro do container:
 *   docker compose exec r-engine Rscript -e "parse('<arquivo>')"
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateScriptForStage, type Stage } from "./index";

const CASOS: { stage: Stage; construct: string; params: unknown }[] = [
  {
    stage: "aigenie",
    construct: "Ansiedade acadêmica",
    params: {
      mode: "generate",
      model: "gpt-4o",
      temperature: 1,
      topP: 1,
      targetN: 60,
      adaptive: true,
      allTogether: false,
      runOverall: true,
      embeddingModel: "text-embedding-3-small",
      egaModel: "TMFG",
      egaAlgorithm: "walktrap",
      domain: "psicologia educacional",
      scaleTitle: "Escala de teste",
      audience: "estudantes universitários",
      responseOptions: ["discordo", "neutro", "concordo"],
      systemRole: null,
      // Aspas e acentos no mesmo campo: exercita o escape do gerador.
      promptNotes: 'Itens devem começar com "Eu". Evite negação dupla.',
      itemTypes: [
        {
          type: "apreensão avaliativa",
          attributes: ["antes da prova", "durante a prova", "ao receber a nota"],
          definition: "Medo antecipatório de avaliação formal.",
        },
        { type: "evitação", attributes: ["procrastinação", "esquiva"], definition: null },
      ],
      itemExamples: [
        {
          statement: "Eu fico com a mente em branco durante as provas.",
          attribute: "durante a prova",
          type: "apreensão avaliativa",
        },
      ],
    },
  },
  {
    stage: "difficulty",
    construct: "x",
    params: {
      algorithm: "ensemble",
      useTextFeatures: true,
      useEmbeddingFeatures: true,
      embeddingModel: "text-embedding-3-large",
      crossValidationFolds: 5,
    },
  },
  {
    stage: "irt",
    construct: "x",
    params: {
      irtModel: "2PL",
      responseFormat: "likert5",
      models: ["gpt-4o"],
      syntheticN: 100,
      temperature: 1,
      personaSeed: "aleatório",
    },
  },
  {
    stage: "sample_design",
    construct: "x",
    params: {
      targetSampleN: 500,
      targetThetaSE: 0.3,
      strata: [
        { label: "Sudeste", populationShare: 0.42 },
        { label: "Nordeste", populationShare: 0.27, sampledN: null },
      ],
    },
  },
];

function temRscript(): boolean {
  try {
    execFileSync("Rscript", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!temRscript()) {
  console.error(
    "Rscript não encontrado no PATH — sem ele não há como validar a sintaxe.\n" +
      "Instale o R, ou rode a verificação dentro do container do r-engine.",
  );
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), "psychgen-rsyntax-"));
let falhas = 0;

try {
  for (const caso of CASOS) {
    const arquivo = join(dir, `${caso.stage}.R`);
    writeFileSync(
      arquivo,
      generateScriptForStage(caso.stage, {
        construct: caso.construct,
        params: caso.params as never,
      }),
    );
    try {
      execFileSync("Rscript", ["-e", `invisible(parse(${JSON.stringify(arquivo)}))`], {
        stdio: "pipe",
      });
      console.log(`  [ok]    ${caso.stage}`);
    } catch (e) {
      const err = e as { stderr?: Buffer };
      console.error(`  [FALHA] ${caso.stage}\n${err.stderr?.toString() ?? e}`);
      falhas++;
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (falhas > 0) {
  console.error(`\n${falhas} estágio(s) geram R inválido.`);
  process.exit(1);
}
console.log("\nTodos os estágios geram R sintaticamente válido.");
