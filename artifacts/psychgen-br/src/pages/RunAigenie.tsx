import { useParams, Link, useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRunAigenieStage, useGetProject } from "@workspace/api-client-react";
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
import { ArrowLeft, Play, Info, Plus, X, TriangleAlert } from "lucide-react";
import { RScriptPreview } from "@/components/r-script-preview";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

type FormValues = z.infer<typeof RunAigenieStageBody>;

/**
 * Atributos e opções de resposta são editados como texto livre (um por linha /
 * separados por vírgula) e convertidos para string[] na borda. Um field array
 * aninhado por atributo dentro de cada tipo de item deixaria o formulário
 * pesado sem ganho real de usabilidade.
 */
const linesToArray = (s: string) =>
  s.split("\n").map((v) => v.trim()).filter((v) => v !== "");
const commaToArray = (s: string) =>
  s.split(",").map((v) => v.trim()).filter((v) => v !== "");

export default function RunAigenie() {
  const routeParams = useParams();
  const id = Number(routeParams.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: project, isLoading: isLoadingProject } = useGetProject(id);
  const runStage = useRunAigenieStage();

  const form = useForm<FormValues>({
    resolver: zodResolver(RunAigenieStageBody) as never,
    defaultValues: {
      params: {
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
      },
    },
  });

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
    .filter((t) => new Set(t.attributes ?? []).size < 2)
    .map((t) => t.type || "(sem nome)");

  function onSubmit(values: FormValues) {
    const p = values.params;
    const payload: FormValues = {
      params: {
        ...p,
        itemTypes: (p.itemTypes ?? [])
          .filter((t) => t.type.trim() !== "")
          .map((t) => ({
            type: t.type.trim(),
            attributes: (t.attributes ?? []).filter((a) => a.trim() !== ""),
            definition: t.definition?.trim() ? t.definition.trim() : undefined,
          })),
        itemExamples: (p.itemExamples ?? []).filter(
          (e) => e.statement.trim() !== "" && e.attribute.trim() !== "" && e.type.trim() !== "",
        ),
        domain: p.domain?.trim() || undefined,
        scaleTitle: p.scaleTitle?.trim() || undefined,
        audience: p.audience?.trim() || undefined,
        systemRole: p.systemRole?.trim() || undefined,
        promptNotes: p.promptNotes?.trim() || undefined,
      },
    };

    runStage.mutate(
      { id, data: payload },
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

  if (isLoadingProject) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[600px] w-full" />
      </div>
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
            Projeto: {project?.name} • Geração e validação estrutural
          </p>
        </div>
      </div>

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
                            <Input
                              placeholder="discordo totalmente, discordo, neutro, concordo, concordo totalmente"
                              value={(field.value ?? []).join(", ")}
                              onChange={(e) => field.onChange(commaToArray(e.target.value))}
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
                                <Textarea
                                  className="min-h-[90px] font-mono text-sm"
                                  placeholder={"ansioso\ninseguro\nirritável\nabatido"}
                                  value={(field.value ?? []).join("\n")}
                                  onChange={(e) => field.onChange(linesToArray(e.target.value))}
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

                  <div className="flex justify-end gap-4 pt-6 border-t">
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
            params={form.watch("params")}
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
