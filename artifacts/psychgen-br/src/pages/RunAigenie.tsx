import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useRunAigenieStage,
  useGetProject,
  useListPipelineJobs,
  getListPipelineJobsQueryKey,
} from "@workspace/api-client-react";
import {
  RunAigenieStageBody,
  runAigenieStageBodyParamsModeDefault,
  runAigenieStageBodyParamsModelDefault,
  runAigenieStageBodyParamsTemperatureDefault,
  runAigenieStageBodyParamsTopPDefault,
  runAigenieStageBodyParamsTargetNDefault,
  runAigenieStageBodyParamsAdaptiveDefault,
  runAigenieStageBodyParamsAllTogetherDefault,
  runAigenieStageBodyParamsRunOverallDefault,
  runAigenieStageBodyParamsEmbeddingModelDefault,
  runAigenieStageBodyParamsEgaModelDefault,
  runAigenieStageBodyParamsEgaAlgorithmDefault,
} from "@workspace/api-zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Play, Info, Plus, X, TriangleAlert, RotateCcw, History } from "lucide-react";
import { RScriptPreview } from "@/components/r-script-preview";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

type FormValues = z.infer<typeof RunAigenieStageBody>;
type Params = FormValues["params"];

/**
 * Persistência do formulário.
 *
 * Configurar uma rodada do AI-GENIE dá trabalho: dimensões, atributos,
 * definições, itens-âncora. Perder tudo porque a execução falhou — e ela vai
 * falhar algumas vezes enquanto o pipeline amadurece — torna cada tentativa
 * cara demais para valer a pena.
 *
 * Duas camadas:
 *   1. Rascunho no navegador, salvo a cada alteração e por projeto. Cobre
 *      recarregar a página, fechar o navegador, voltar depois de um erro.
 *   2. Se não houver rascunho, os parâmetros da última execução do projeto,
 *      que já ficam gravados em `pipeline_jobs.paramsJson`. Cobre outro
 *      navegador ou outra máquina.
 *
 * A chave é versionada: se o formato dos parâmetros mudar, rascunhos antigos
 * são ignorados em vez de quebrar o formulário.
 */
const CHAVE_RASCUNHO = (projectId: number) => `psychgen:aigenie:v1:${projectId}`;

function lerRascunho(projectId: number): Params | null {
  try {
    const cru = window.localStorage.getItem(CHAVE_RASCUNHO(projectId));
    if (!cru) return null;
    const obj = JSON.parse(cru) as unknown;
    if (typeof obj !== "object" || obj === null) return null;
    return obj as Params;
  } catch {
    // localStorage pode estar indisponível (janela anônima, política do
    // navegador). Sem rascunho é degradação aceitável; quebrar a tela não é.
    return null;
  }
}

function salvarRascunho(projectId: number, params: Params) {
  try {
    window.localStorage.setItem(CHAVE_RASCUNHO(projectId), JSON.stringify(params));
  } catch {
    /* idem */
  }
}

function apagarRascunho(projectId: number) {
  try {
    window.localStorage.removeItem(CHAVE_RASCUNHO(projectId));
  } catch {
    /* idem */
  }
}

const PARAMS_PADRAO = (): Params => ({
  mode: runAigenieStageBodyParamsModeDefault,
  model: runAigenieStageBodyParamsModelDefault,
  temperature: runAigenieStageBodyParamsTemperatureDefault,
  topP: runAigenieStageBodyParamsTopPDefault,
  targetN: runAigenieStageBodyParamsTargetNDefault,
  adaptive: runAigenieStageBodyParamsAdaptiveDefault,
  allTogether: runAigenieStageBodyParamsAllTogetherDefault,
  runOverall: runAigenieStageBodyParamsRunOverallDefault,
  embeddingModel: runAigenieStageBodyParamsEmbeddingModelDefault,
  egaModel: runAigenieStageBodyParamsEgaModelDefault,
  egaAlgorithm: runAigenieStageBodyParamsEgaAlgorithmDefault,
  domain: "",
  scaleTitle: "",
  audience: "",
  responseOptions: [],
  systemRole: "",
  promptNotes: "",
  itemTypes: [{ type: "", attributes: [], definition: "" }],
  itemExamples: [],
});

/**
 * Completa o que vier de fora (rascunho ou execução anterior) com os padrões.
 * Sem isso, um parâmetro adicionado depois que o rascunho foi salvo chegaria
 * como `undefined` e derrubaria o campo correspondente.
 */
function comPadroes(parcial: Partial<Params> | null | undefined): Params {
  const padrao = PARAMS_PADRAO();
  if (!parcial) return padrao;
  const juntos = { ...padrao, ...parcial } as Params;
  // Campos de lista precisam ser array de verdade — um rascunho corrompido
  // não pode virar `.map of undefined` na renderização.
  if (!Array.isArray(juntos.itemTypes) || juntos.itemTypes.length === 0) {
    juntos.itemTypes = padrao.itemTypes;
  }
  if (!Array.isArray(juntos.itemExamples)) juntos.itemExamples = [];
  if (!Array.isArray(juntos.responseOptions)) juntos.responseOptions = [];
  juntos.itemTypes = juntos.itemTypes.map((t) => ({
    type: t?.type ?? "",
    attributes: Array.isArray(t?.attributes) ? t.attributes : [],
    definition: t?.definition ?? "",
  }));
  return juntos;
}

/** Remove espaços das pontas e descarta entradas vazias. Só na saída. */
const limpar = (xs: string[] | undefined) =>
  (xs ?? []).map((v) => v.trim()).filter((v) => v !== "");

/**
 * Lista editada como texto livre — um item por linha, ou separados por vírgula.
 *
 * O texto digitado vive em estado local; o formulário recebe a lista já
 * fatiada, mas SEM normalização. A versão anterior aparava espaços e descartava
 * vazios a cada tecla e reescrevia o campo com o resultado — então a barra de
 * espaço não funcionava: o espaço era inserido e removido no mesmo instante,
 * e não dava para digitar "antes da prova".
 *
 * A normalização acontece uma vez, no envio (`limpar`), e nas contagens que
 * alimentam os avisos. O estado local é inicializado uma vez: este formulário
 * não faz reset externo desses campos.
 */
function ListaTexto({
  value,
  onChange,
  multilinha = false,
  placeholder,
  className,
}: {
  value: string[] | undefined;
  onChange: (v: string[]) => void;
  multilinha?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const separador = multilinha ? "\n" : ", ";
  const [texto, setTexto] = useState(() => (value ?? []).join(separador));

  const aoDigitar = (t: string) => {
    setTexto(t);
    onChange(t.split(multilinha ? "\n" : ","));
  };

  return multilinha ? (
    <Textarea
      className={className}
      placeholder={placeholder}
      value={texto}
      onChange={(e) => aoDigitar(e.target.value)}
    />
  ) : (
    <Input
      className={className}
      placeholder={placeholder}
      value={texto}
      onChange={(e) => aoDigitar(e.target.value)}
    />
  );
}

type Origem = "padrao" | "rascunho" | "execucao";

/**
 * A página resolve a configuração inicial ANTES de montar o formulário.
 *
 * Não dá para preencher depois com `form.reset()`: os campos de lista guardam
 * o texto digitado em estado local, inicializado uma vez, e não veriam a
 * atualização. Montar o formulário só com a semente pronta evita isso.
 */
export default function RunAigenie() {
  const routeParams = useParams();
  const id = Number(routeParams.id);
  const { data: project, isLoading: carregandoProjeto } = useGetProject(id);

  const rascunho = useMemo(() => (Number.isFinite(id) ? lerRascunho(id) : null), [id]);

  // Só consulta as execuções anteriores quando não há rascunho local.
  const filtroJobs = { projectId: id, stage: "aigenie" as never };
  const { data: jobs, isLoading: carregandoJobs } = useListPipelineJobs(filtroJobs, {
    query: {
      queryKey: getListPipelineJobsQueryKey(filtroJobs),
      enabled: Number.isFinite(id) && rascunho === null,
    },
  });

  if (carregandoProjeto || (rascunho === null && carregandoJobs)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  const ultimaExecucao = (jobs ?? [])
    .map((j) => (j.paramsJson as { params?: Partial<Params> } | null)?.params)
    .find((p) => p != null);

  const origem: Origem = rascunho ? "rascunho" : ultimaExecucao ? "execucao" : "padrao";
  const semente = comPadroes(rascunho ?? ultimaExecucao);

  return (
    <FormularioAigenie
      key={id}
      id={id}
      nomeProjeto={project?.name}
      semente={semente}
      origem={origem}
    />
  );
}

function FormularioAigenie({
  id,
  nomeProjeto,
  semente,
  origem,
}: {
  id: number;
  nomeProjeto: string | undefined;
  semente: Params;
  origem: Origem;
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const runStage = useRunAigenieStage();
  const [avisoOrigem, setAvisoOrigem] = useState(origem !== "padrao");

  const form = useForm<FormValues>({
    resolver: zodResolver(RunAigenieStageBody) as never,
    defaultValues: { params: semente },
  });

  // Salva o rascunho a cada alteração. É o que faz a configuração sobreviver
  // a um erro, a um F5 ou ao navegador fechado.
  useEffect(() => {
    const sub = form.watch((valores) => {
      if (valores?.params) salvarRascunho(id, valores.params as Params);
    });
    return () => sub.unsubscribe();
  }, [form, id]);

  function limparFormulario() {
    apagarRascunho(id);
    window.location.reload();
  }

  const {
    fields: typeFields,
    append: appendType,
    remove: removeType,
  } = useFieldArray({ control: form.control as never, name: "params.itemTypes" });

  const {
    fields: exampleFields,
    append: appendExample,
    remove: removeExample,
  } = useFieldArray({ control: form.control as never, name: "params.itemExamples" });

  const mode = form.watch("params.mode");
  const targetN = form.watch("params.targetN");
  const itemTypes = form.watch("params.itemTypes");

  // Avisos que refletem o método, não o formulário: o artigo recomenda >= 60
  // itens por tipo, e o pacote rejeita tipos com menos de 2 atributos únicos.
  const tiposComPoucosAtributos = (itemTypes ?? [])
    .filter((t) => new Set(limpar(t.attributes)).size < 2)
    .map((t) => t.type.trim() || "(sem nome)");

  // Uma normalização só, usada pelo envio e pelo painel de sintaxe R. Se cada
  // um limpasse à sua maneira, o script previsto divergiria do executado.
  function normalizar(p: FormValues["params"]): FormValues["params"] {
    return {
      ...p,
      itemTypes: (p.itemTypes ?? [])
        .filter((t) => t.type.trim() !== "")
        .map((t) => ({
          type: t.type.trim(),
          attributes: limpar(t.attributes),
          definition: t.definition?.trim() ? t.definition.trim() : undefined,
        })),
      responseOptions: limpar(p.responseOptions),
      itemExamples: (p.itemExamples ?? [])
        .map((e) => ({
          statement: e.statement.trim(),
          attribute: e.attribute.trim(),
          type: e.type.trim(),
        }))
        .filter((e) => e.statement !== "" && e.attribute !== "" && e.type !== ""),
      domain: p.domain?.trim() || undefined,
      scaleTitle: p.scaleTitle?.trim() || undefined,
      audience: p.audience?.trim() || undefined,
      systemRole: p.systemRole?.trim() || undefined,
      promptNotes: p.promptNotes?.trim() || undefined,
    };
  }

  function onSubmit(values: FormValues) {
    runStage.mutate(
      { id, data: { params: normalizar(values.params) } },
      {
        onSuccess: (job) => {
          toast({
            title: mode === "validate" ? "GENIE iniciado" : "AI-GENIE iniciado",
            description: "O processo foi colocado na fila.",
          });
          setLocation(`/jobs/${job.id}`);
        },
        onError: () => {
          toast({
            title: "Erro",
            description: "Não foi possível iniciar o estágio.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href={`/projects/${id}`}>
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Executar AI-GENIE</h1>
          <p className="text-muted-foreground">
            Projeto: {nomeProjeto} • Geração e validação estrutural
          </p>
        </div>
      </div>

      {avisoOrigem && (
        <Alert>
          <History className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>
              {origem === "rascunho"
                ? "Recuperamos a configuração que você tinha preenchido neste projeto."
                : "Preenchemos com os parâmetros da última execução deste projeto."}{" "}
              Confira antes de rodar.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAvisoOrigem(false)}
            >
              Ok
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Configuração do pipeline</CardTitle>
              <CardDescription>
                Os parâmetros abaixo mapeiam nos argumentos de{" "}
                <code>AIGENIE::AIGENIE()</code> e <code>AIGENIE::GENIE()</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  {/* ---------------------------------------------------- Modo */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium border-b pb-2">Modo</h3>
                    <FormField
                      control={form.control}
                      name="params.mode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>O que executar</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="generate">
                                Gerar itens novos (AIGENIE)
                              </SelectItem>
                              <SelectItem value="validate">
                                Só validar os itens já existentes (GENIE)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {field.value === "validate"
                              ? "Nenhum item novo é gerado. O pipeline reduz o pool que já está no projeto e marca como rejeitados os itens redundantes ou instáveis."
                              : "Gera o pool e aplica a redução: UVA remove redundâncias, bootEGA remove itens instáveis."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* -------------------------------------- Construto e público */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium border-b pb-2">
                      Construto e público-alvo
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="params.scaleTitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Título da escala</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Ex.: Inventário de Ansiedade Acadêmica"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="params.domain"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Domínio</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Ex.: psicologia educacional"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormDescription>Específico funciona melhor que genérico.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="params.audience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>População-alvo</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ex.: adolescentes brasileiros de escola pública, 14 a 17 anos"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormDescription>
                            Quanto mais específica, melhor o registro linguístico dos itens.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="params.responseOptions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Opções de resposta</FormLabel>
                          <FormControl>
                            <ListaTexto
                              placeholder="discordo totalmente, discordo, neutro, concordo, concordo totalmente"
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormDescription>
                            Separadas por vírgula. Dão contexto ao LLM; não aparecem no texto do item.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* ------------------------------------ Dimensões e atributos */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium border-b pb-2">
                      Dimensões e atributos
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      O AI-GENIE gera itens <strong>por atributo</strong>, não por construto
                      solto. É a atribuição por atributo que serve de gabarito para o NMI —
                      um teste mais exigente do que apenas recuperar as dimensões amplas.
                    </p>

                    {tiposComPoucosAtributos.length > 0 && (
                      <Alert variant="destructive">
                        <TriangleAlert className="h-4 w-4" />
                        <AlertDescription>
                          Cada dimensão precisa de pelo menos 2 atributos únicos. Insuficientes:{" "}
                          {tiposComPoucosAtributos.join(", ")}.
                        </AlertDescription>
                      </Alert>
                    )}

                    {typeFields.map((f, index) => (
                      <div key={f.id} className="rounded-lg border p-4 space-y-3">
                        <div className="flex items-start gap-2">
                          <FormField
                            control={form.control}
                            name={`params.itemTypes.${index}.type`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormLabel>Dimensão {index + 1}</FormLabel>
                                <FormControl>
                                  <Input placeholder="Ex.: neuroticismo" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="mt-8"
                            onClick={() => removeType(index)}
                            disabled={typeFields.length === 1}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <FormField
                          control={form.control}
                          name={`params.itemTypes.${index}.attributes`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Atributos (um por linha, mínimo 2)</FormLabel>
                              <FormControl>
                                <ListaTexto
                                  multilinha
                                  className="min-h-[90px] font-mono text-sm"
                                  placeholder={"ansioso\ninseguro\nirritável\nabatido"}
                                  value={field.value}
                                  onChange={field.onChange}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`params.itemTypes.${index}.definition`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Definição conceitual (opcional)</FormLabel>
                              <FormControl>
                                <Textarea
                                  className="min-h-[70px]"
                                  placeholder="Ex.: Neuroticismo — tendência a experimentar emoções negativas com frequência e intensidade."
                                  {...field}
                                  value={field.value ?? ""}
                                />
                              </FormControl>
                              <FormDescription>
                                Importante para construtos emergentes ou pouco representados no
                                treino do modelo.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendType({ type: "", attributes: [], definition: "" })}
                    >
                      <Plus className="h-4 w-4 mr-2" /> Adicionar dimensão
                    </Button>
                  </div>

                  {/* ------------------------------------------------ Geração */}
                  {mode === "generate" && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium border-b pb-2">Geração</h3>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="params.model"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Modelo gerador</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                                  <SelectItem value="gpt-4o-mini">GPT-4o mini</SelectItem>
                                  <SelectItem value="sonnet">Claude Sonnet</SelectItem>
                                  <SelectItem value="opus">Claude Opus</SelectItem>
                                  <SelectItem value="llama-3.3-70b-versatile">
                                    Llama 3.3 70B (Groq)
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="params.targetN"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Itens por dimensão (antes da redução)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={10}
                                  max={300}
                                  {...field}
                                  onChange={(e) => field.onChange(Number(e.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {targetN < 60 && (
                        <Alert>
                          <TriangleAlert className="h-4 w-4" />
                          <AlertDescription>
                            O artigo recomenda 60 ou mais itens por dimensão. Abaixo disso, UVA
                            e bootEGA têm pouco o que reduzir e a estabilidade fica ruidosa.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="grid sm:grid-cols-2 gap-6 pt-2">
                        <FormField
                          control={form.control}
                          name="params.temperature"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex justify-between">
                                <span>Temperature</span>
                                <span className="text-muted-foreground">{field.value}</span>
                              </FormLabel>
                              <FormControl>
                                <Slider
                                  min={0}
                                  max={2}
                                  step={0.05}
                                  value={[field.value]}
                                  onValueChange={(v) => field.onChange(v[0])}
                                />
                              </FormControl>
                              <FormDescription>
                                Mais alta = pool mais amplo; mais baixa = foco mais estreito.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="params.topP"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex justify-between">
                                <span>Top P</span>
                                <span className="text-muted-foreground">{field.value}</span>
                              </FormLabel>
                              <FormControl>
                                <Slider
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  value={[field.value]}
                                  onValueChange={(v) => field.onChange(v[0])}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="params.adaptive"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel>Prompt adaptativo</FormLabel>
                              <FormDescription>
                                Injeta os itens já gerados no prompt seguinte para o modelo não
                                repetir. Deixe ligado, salvo limite de contexto.
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* ---------------------------------- Itens-âncora (exemplos) */}
                  {mode === "generate" && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium border-b pb-2">
                        Itens-âncora (opcional)
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Exemplos de estilo e registro. É por aqui que entram os itens de uma
                        forma existente quando o objetivo é gerar uma <strong>forma
                        paralela</strong>. Use itens validados — eles servem de molde.
                      </p>
                      {exampleFields.map((f, index) => (
                        <div key={f.id} className="flex items-start gap-2">
                          <FormField
                            control={form.control}
                            name={`params.itemExamples.${index}.statement`}
                            render={({ field }) => (
                              <FormItem className="flex-[3]">
                                <FormControl>
                                  <Input placeholder="Texto do item" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`params.itemExamples.${index}.attribute`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormControl>
                                  <Input placeholder="atributo" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`params.itemExamples.${index}.type`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormControl>
                                  <Input placeholder="dimensão" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => removeExample(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          appendExample({ statement: "", attribute: "", type: "" })
                        }
                      >
                        <Plus className="h-4 w-4 mr-2" /> Adicionar item-âncora
                      </Button>
                    </div>
                  )}

                  {/* ------------------------------------- Validação estrutural */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium border-b pb-2">
                      Validação estrutural (EGA / UVA / bootEGA)
                    </h3>
                    <div className="grid sm:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="params.embeddingModel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Embeddings</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="text-embedding-3-small">
                                  text-embedding-3-small
                                </SelectItem>
                                <SelectItem value="text-embedding-3-large">
                                  text-embedding-3-large
                                </SelectItem>
                                <SelectItem value="jina-embeddings-v3">
                                  jina-embeddings-v3
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              O artigo usa o <em>small</em>.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="params.egaModel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Rede</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="TMFG">TMFG</SelectItem>
                                <SelectItem value="glasso">EBICglasso</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              TMFG vai levemente melhor com texto.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="params.egaAlgorithm"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Comunidades</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="walktrap">Walktrap</SelectItem>
                                <SelectItem value="louvain">Louvain</SelectItem>
                                <SelectItem value="leiden">Leiden</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>O artigo usa Walktrap.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="params.allTogether"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Reduzir todas as dimensões juntas</FormLabel>
                            <FormDescription>
                              Por padrão cada dimensão passa pelo pipeline separadamente.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="params.runOverall"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Análise do pool completo ao final</FormLabel>
                            <FormDescription>
                              Roda um EGA sobre todos os itens sobreviventes, sem reduzir mais.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* ------------------------------------------------- Prompt */}
                  {mode === "generate" && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium border-b pb-2">Prompt</h3>
                      <FormField
                        control={form.control}
                        name="params.promptNotes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Instruções adicionais</FormLabel>
                            <FormControl>
                              <Textarea
                                className="min-h-[80px]"
                                placeholder="Ex.: Todos os itens devem começar com 'Eu sou alguém que...'. Evite dupla negativa."
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormDescription>
                              Anexadas ao fim do prompt. Curtas funcionam melhor.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="params.systemRole"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Papel de sistema (opcional)</FormLabel>
                            <FormControl>
                              <Textarea
                                className="min-h-[80px]"
                                placeholder="Deixe vazio para o AI-GENIE construir a persona a partir do domínio e da população-alvo."
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormDescription>
                              Preenchido, sobrescreve domínio, público e definições na
                              construção da persona.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <div className="flex justify-end items-center gap-4 pt-6 border-t">
                    <Button
                      type="button"
                      variant="ghost"
                      className="mr-auto gap-2 text-muted-foreground"
                      onClick={limparFormulario}
                    >
                      <RotateCcw className="h-4 w-4" /> Limpar formulário
                    </Button>
                    <Link href={`/projects/${id}`}>
                      <Button type="button" variant="ghost">
                        Cancelar
                      </Button>
                    </Link>
                    <Button type="submit" disabled={runStage.isPending} className="gap-2">
                      {runStage.isPending ? (
                        "Iniciando..."
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          {mode === "validate" ? "Validar pool" : "Gerar e validar"}
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {/* Coluna direita: sintaxe R ao vivo + explicação do método */}
        <div className="space-y-6">
          <RScriptPreview
            projectId={id}
            stage="aigenie"
            params={normalizar(form.watch("params"))}
            filenamePrefix="aigenie"
          />
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" /> Os 6 passos do AI-GENIE
              </CardTitle>
              <CardDescription>
                Russell-Lasalandra, Christensen &amp; Golino (2026),{" "}
                <em>Behavior Research Methods</em>, 58:217
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <ol className="space-y-3 list-decimal pl-4">
                <li>
                  <strong className="text-foreground">Embeddings.</strong> Cada item vira um
                  vetor. A matriz é transposta: dimensões do embedding nas linhas, itens nas
                  colunas.
                </li>
                <li>
                  <strong className="text-foreground">EGA inicial.</strong> Constrói a rede e
                  detecta comunidades. O NMI compara essas comunidades com o gabarito de
                  atributos — é a linha de base.
                </li>
                <li>
                  <strong className="text-foreground">UVA até não sobrar redundância.</strong>{" "}
                  Sobreposição topológica ponderada (wTO) detecta itens quase idênticos.
                  De cada par redundante fica o mais distinto dos demais. Repete até zerar.
                </li>
                <li>
                  <strong className="text-foreground">Embedding full ou sparse.</strong> Roda
                  os dois e mantém o de maior NMI.
                </li>
                <li>
                  <strong className="text-foreground">bootEGA até tudo estabilizar.</strong>{" "}
                  100 subamostras; itens que mudam de comunidade em mais de 25% delas são
                  removidos. Normalmente leva 2 a 3 rodadas. É o filtro de qualidade central.
                </li>
                <li>
                  <strong className="text-foreground">NMI final.</strong> Deve empatar ou
                  superar o inicial. É essa diferença que vira evidência de validade
                  estrutural no relatório.
                </li>
              </ol>
              <Alert>
                <AlertDescription className="text-xs">
                  O AI-GENIE cobre a <strong>fase estrutural</strong> da validação (evidência
                  baseada na estrutura interna). Não substitui análise IRT de dificuldade e
                  discriminação, nem evidências de conteúdo, processo de resposta ou relação
                  com outras variáveis.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
