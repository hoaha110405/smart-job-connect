/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/modules/rag/rag.service.ts (refactored + improved matching + auto-translate to English)
import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model as MModel } from "mongoose";
import _ from "lodash";

import { Embedding } from "./schemas/embedding.schema";
import { Cv } from "../cv/schemas/cv.schema";
import { chunkText } from "./utils/chunker";
import { OpenAIService } from "./openai.service";
import { Job } from "../job/schemas/job.schema";

/* -------------------------------------------------------------------------- */
/* Types / Interfaces                                                         */
/* -------------------------------------------------------------------------- */

type RetrievalResult = {
  score: number;
  text: string;
  metadata: any;
};

/* -------------------------------------------------------------------------- */
/* RagService - single class but logically separated into sections below       */
/* -------------------------------------------------------------------------- */

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly openai: OpenAIService,

    @InjectModel(Embedding.name)
    private readonly embeddingModel: MModel<Embedding>,

    @InjectModel(Cv.name)
    private readonly cvModel: MModel<Cv>,

    @InjectModel(Job.name)
    private readonly jobModel: MModel<Job>,
  ) {}

  /* ------------------------------------------------------------------------ */
  /* Helpers (private)                                                         */
  /* ------------------------------------------------------------------------ */

  /** Cosine similarity helper. */
  private cosine(a: number[], b: number[]): number {
    let dot = 0,
      na = 0,
      nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    // if vectors have different lengths, ignore tail of longer one.
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-20);
  }

  /** Normalize various embedding response shapes from OpenAI wrapper. */
  private normalizeEmbResp(embRaw: any): number[] | undefined {
    if (!embRaw) return undefined;
    if (Array.isArray(embRaw) && typeof embRaw[0] === "number")
      return embRaw as number[];
    if (embRaw?.data?.[0]?.embedding && Array.isArray(embRaw.data[0].embedding))
      return embRaw.data[0].embedding as number[];
    if (embRaw?.embedding && Array.isArray(embRaw.embedding))
      return embRaw.embedding as number[];
    return undefined;
  }

  /** Normalize a skill string (small heuristics + synonyms). */
  private normalizeSkillName(s: any): string {
    if (!s) return "";
    let name = (typeof s === "string" ? s : s?.name || "")
      .toString()
      .toLowerCase()
      .trim();
    // basic normalization
    name = name.replace(/\bjs\b/g, "javascript");
    name = name.replace(/\bnode\b/g, "node.js");
    name = name.replace(/\breactjs\b/g, "react");
    name = name.replace(/\bnextjs\b/g, "next.js");
    name = name.replace(/[\"'`]/g, "");
    name = name.replace(/[^a-z0-9\.\+#\- ]+/g, "");
    return name;
  }

  private computeCandYearsFromCv(cvObj: any): number {
    try {
      const yearsList = (cvObj.experiences || []).map((e: any) => {
        if (!e || !e.from) return 0;
        const from = new Date(e.from).getFullYear();
        const to = e.to
          ? new Date(e.to).getFullYear()
          : new Date().getFullYear();
        const diff = to - from;
        return isFinite(diff) && diff > 0 ? diff : 0;
      });
      return yearsList.reduce((a: number, b: number) => a + b, 0);
    } catch {
      return 0;
    }
  }

  private extractSeniorityKeyFromText(raw: string): string {
    const seniorityRank: Record<string, number> = {
      intern: 0,
      entry: 0.5,
      junior: 1,
      mid: 2,
      senior: 3,
      lead: 4,
      manager: 5,
      director: 6,
      vp: 7,
      c: 8,
    };
    const lowered = (raw || "").toString().toLowerCase();
    for (const k of Object.keys(seniorityRank)) {
      if (lowered.includes(k)) return k;
    }
    return "";
  }

  /** Compute non-semantic components used in final scoring (skills/exp/etc). */
  private computeNonSemantic(jobObj: any, cvObj: any) {
    // skills
    const jobSkills = (jobObj.skills || [])
      .map((s: any) =>
        (typeof s === "string" ? s : s?.name || "")
          .toString()
          .toLowerCase()
          .trim(),
      )
      .filter(Boolean);
    const cvSkills = (cvObj.skills || [])
      .map((s: any) =>
        (typeof s === "string" ? s : s?.name || "")
          .toString()
          .toLowerCase()
          .trim(),
      )
      .filter(Boolean);

    let skillsScore = 0;
    if (jobSkills.length > 0 && cvSkills.length > 0) {
      const jobSet = new Set(jobSkills);
      const matchCount = cvSkills.filter((s: string) => jobSet.has(s)).length;
      skillsScore = Math.max(0, Math.min(1, matchCount / jobSkills.length));
    }

    // experience
    const jobExp = Number(jobObj.experienceYears || 0);
    let candYears = 0;
    try {
      const yearsList = (cvObj.experiences || []).map((e: any) => {
        if (!e || !e.from) return 0;
        const from = new Date(e.from).getFullYear();
        const to = e.to
          ? new Date(e.to).getFullYear()
          : new Date().getFullYear();
        const diff = to - from;
        return isFinite(diff) && diff > 0 ? diff : 0;
      });
      candYears = yearsList.reduce((a: number, b: number) => a + b, 0);
    } catch {
      candYears = 0;
    }
    const experienceScore = jobExp <= 0 ? 1 : Math.min(1, candYears / jobExp);

    // seniority
    const seniorityRank: Record<string, number> = {
      intern: 0,
      entry: 0.5,
      junior: 1,
      mid: 2,
      senior: 3,
      lead: 4,
      manager: 5,
      director: 6,
      vp: 7,
      c: 8,
    };
    const jobSen = (jobObj.seniority || "").toString().toLowerCase().trim();
    const cvSenRaw = (cvObj.targetRole || cvObj.headline || "")
      .toString()
      .toLowerCase();
    let cvSenKey = "";
    for (const k of Object.keys(seniorityRank)) {
      if (cvSenRaw.includes(k)) {
        cvSenKey = k;
        break;
      }
    }
    const jobRank = seniorityRank[jobSen] ?? null;
    const cvRank = seniorityRank[cvSenKey] ?? null;
    let seniorityScore = 0.5;
    if (jobRank != null && cvRank != null) {
      const diff = Math.abs(jobRank - cvRank);
      seniorityScore = Math.max(0, 1 - diff / Math.max(1, jobRank));
    }

    // location (basic)
    let locationScore = 0.5;
    try {
      const jobLoc = jobObj.location || {};
      const cvLoc = cvObj.location || {};
      const jobRemote = !!jobObj.remote || jobLoc.remoteType === "remote";
      const cvRemote = !!cvObj.remote || cvLoc.remoteType === "remote";

      if (jobRemote && cvRemote) locationScore = 1;
      else if (jobRemote && !cvRemote) locationScore = 0.7;
      else if (!jobRemote && cvRemote) locationScore = 0.7;
      else {
        const jobCity = (jobLoc.city || "").toString().toLowerCase().trim();
        const jobCountry = (jobLoc.country || "")
          .toString()
          .toLowerCase()
          .trim();
        const cvCity = (cvLoc.city || "").toString().toLowerCase().trim();
        const cvCountry = (cvLoc.country || "").toString().toLowerCase().trim();
        if (jobCity && cvCity && jobCity === cvCity) locationScore = 1;
        else if (jobCountry && cvCountry && jobCountry === cvCountry)
          locationScore = 0.9;
        else locationScore = 0.4;
      }
    } catch {
      locationScore = 0.5;
    }

    return { skillsScore, experienceScore, seniorityScore, locationScore };
  }

  /* ------------------------------------------------------------------------ */
  /* Translation helpers                                                       */
  /* ------------------------------------------------------------------------ */

  /** Simple Vietnamese detection heuristic */
  private isVietnamese(text: string): boolean {
    if (!text || typeof text !== "string") return false;
    const lowered = text.toLowerCase();
    const keywords = [
      "công ty",
      "kinh nghiệm",
      "kỹ năng",
      "trách nhiệm",
      "yêu cầu",
      "lương",
      "ứng viên",
      "vị trí",
      "mô tả",
      "bằng cấp",
      "đào tạo",
      "mô tả công việc",
    ];
    for (const k of keywords) {
      if (lowered.includes(k)) return true;
    }
    if (
      /[àáạảãâầấậẩẫăằắặẳẵèéẻẽẹêềếệểễìíỉĩịòóỏõọôồốộổỗơờớợởỡùúủũụưừứựửữỳýỷỹỵđ]/i.test(
        lowered,
      )
    )
      return true;
    return false;
  }

  /** Translate arbitrary text to English using chat model. Returns original if fail. */
  private async translateToEnglish(text: string): Promise<string> {
    if (!text || text.trim().length === 0) return text;
    try {
      const system = `You are a high-quality translator. Translate the user's content to fluent, natural American English.\n- Preserve technical terms, acronyms, company names, and year/date formats.\n- Keep short bullets and lists as plain text (do not format as markdown).\n- Return ONLY the translated text (no explanations).`;
      const userMsg = `Translate the following text to English. If the text is already English, just return it unchanged.\n\n---\n${text}\n---`;
      const resp = await this.openai.createChatCompletion(
        [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        1200,
      );
      const translated = resp?.choices?.[0]?.message?.content ?? "";
      return translated && translated.trim().length > 0
        ? translated.trim()
        : text;
    } catch (e) {
      this.logger.warn(`Translation failed: ${String(e)}`);
      return text;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* CV: build / index / retrieve                                               */
  /* ------------------------------------------------------------------------ */

  /** Build a combined plain-text representation for a CV document. */
  buildCvText(cv: any): string {
    const parts: string[] = [];

    if (cv.targetRole) parts.push(`Target role: ${cv.targetRole}`);
    if (cv.headline) parts.push(cv.headline);
    if (cv.summary) parts.push(cv.summary);

    if (cv.skills?.length) {
      parts.push(
        "Skills: " +
          cv.skills
            .map((s: any) => s.name + (s.years ? ` (${s.years}y)` : ""))
            .join(", "),
      );
    }

    if (cv.experiences?.length) {
      const exText = cv.experiences
        .map((e: any) => {
          const resp = Array.isArray(e.responsibilities)
            ? e.responsibilities.join("; ")
            : "";
          const ach = (e.achievements || []).join("; ");
          const when = `${e.from ? new Date(e.from).getFullYear() : ""}-${
            e.to ? new Date(e.to).getFullYear() : ""
          }`;
          return `${e.title || ""} at ${e.company || ""} ${when}\n${resp}\n${ach}`;
        })
        .join("\n\n");
      parts.push("Experience:\n" + exText);
    }

    if (cv.education?.length) {
      parts.push(
        "Education:\n" +
          cv.education
            .map(
              (ed: any) =>
                `${ed.degree || ""} in ${ed.major || ""} — ${ed.school || ""} ${
                  ed.from ? new Date(ed.from).getFullYear() : ""
                }-${ed.to ? new Date(ed.to).getFullYear() : ""}`,
            )
            .join("\n"),
      );
    }

    if (cv.projects?.length) {
      parts.push(
        "Projects:\n" +
          cv.projects
            .map(
              (p: any) =>
                `${p.name}: ${p.description || ""} ${
                  p.metrics ? "Metrics: " + (p.metrics || []).join(", ") : ""
                }`,
            )
            .join("\n"),
      );
    }

    if (cv.certifications?.length) {
      parts.push(
        "Certifications: " +
          cv.certifications
            .map(
              (c: any) =>
                `${c.name} (${c.issuer || ""} ${
                  c.issueDate ? new Date(c.issueDate).getFullYear() : ""
                })`,
            )
            .join(", "),
      );
    }

    if (cv.languages?.length) {
      parts.push(
        "Languages: " +
          cv.languages
            .map((l: any) => `${l.name}${l.level ? " (" + l.level + ")" : ""}`)
            .join(", "),
      );
    }

    if (cv.portfolio?.length) {
      parts.push(
        "Portfolio:\n" +
          cv.portfolio
            .map(
              (pf: any) =>
                `${pf.mediaType || ""}: ${pf.url || ""} ${pf.description || ""}`,
            )
            .join("\n"),
      );
    }

    if (parts.length === 0) return "";
    return parts.join("\n\n");
  }

  /** Index one CV (chunk -> embed -> upsert to Pinecone or save to Mongo). */
  async indexCv(cvId: string) {
    const cv = await this.cvModel.findById(cvId).lean();
    if (!cv) throw new Error("CV not found");

    this.logger.log(
      `Indexing CV ${cv._id} - fullname="${cv.fullname ?? ""}" headline="${
        cv.headline ?? ""
      }" summaryLen=${(cv.summary || "").length}`,
    );

    const fullText = this.buildCvText(cv);
    this.logger.log(`Built fullText length=${fullText?.length ?? 0}`);

    const finalText = fullText ?? "";

    // prepare normalized metadata for doc-level
    const normalizedSkills = (cv.skills || [])
      .map((s: any) => this.normalizeSkillName(s))
      .filter(Boolean);
    const candYears = this.computeCandYearsFromCv(cv);
    const seniorityKey = this.extractSeniorityKeyFromText(
      `${cv.targetRole || ""} ${cv.headline || ""}`,
    );
    const locationNormalized = {
      city: (cv.location?.city || "").toString().toLowerCase(),
      country: (cv.location?.country || "").toString().toLowerCase(),
      remote:
        !!(cv as any).remote || (cv.location as any)?.remoteType === "remote",
    };

    // --- TRANSLATION: if source is Vietnamese, translate fullText -> englishText
    let englishText = finalText;
    let wasTranslated = false;
    try {
      if (this.isVietnamese(finalText)) {
        this.logger.log(
          `Detected Vietnamese CV content for ${cv._id}. Translating before embedding.`,
        );
        const translated = await this.translateToEnglish(finalText);
        if (
          translated &&
          translated.trim().length > 0 &&
          translated !== finalText
        ) {
          englishText = translated;
          wasTranslated = true;
        }
      }
    } catch (e) {
      this.logger.warn(
        `Translation attempt failed for CV ${cv._id}: ${String(e)}`,
      );
      // fallback to original finalText
      englishText = finalText;
      wasTranslated = false;
    }

    // document-level embedding (only if doc is non-empty)
    if (englishText && englishText.trim().length > 0) {
      try {
        const docEmbRaw = await this.openai.createEmbedding(englishText);
        const docEmb = this.normalizeEmbResp(docEmbRaw);
        if (docEmb && docEmb.length) {
          const docMeta = {
            sourceType: "cv",
            sourceId: cv._id.toString(),
            chunkIndex: -1,
            text: englishText.slice(0, 2000),
            embedding: docEmb,
            metadata: {
              docLevel: true,
              fullname: cv.fullname,
              textPreview: englishText.slice(0, 200),
              skillsNormalized: normalizedSkills,
              candYears,
              seniorityKey,
              locationNormalized,
              originalLanguage: wasTranslated ? "vi" : "en",
              translated: wasTranslated,
              originalTextPreview: finalText.slice(0, 200),
            },
          };

          await this.embeddingModel
            .updateOne(
              {
                sourceType: docMeta.sourceType,
                sourceId: docMeta.sourceId,
                chunkIndex: -1,
              },
              {
                $set: {
                  text: docMeta.text,
                  embedding: docMeta.embedding,
                  metadata: docMeta.metadata,
                },
              },
              { upsert: true },
            )
            .exec();

          this.logger.log(
            `Saved document-level embedding for CV ${cv._id} (translated=${wasTranslated})`,
          );
        }
      } catch (e) {
        this.logger.warn(
          `Failed to create/save doc-level embedding for CV ${cv._id}: ${String(e)}`,
        );
      }
    } else {
      // >>> NEW BEHAVIOR: if finalText is empty, DO NOT store any placeholder.
      await this.embeddingModel.deleteMany({
        sourceType: "cv",
        sourceId: cv._id.toString(),
      });

      this.logger.warn(
        `CV ${cv._id} has no content. Deleted existing embeddings (if any). Nothing indexed.`,
      );
      return {
        ok: true,
        backend: "mongo",
        indexed: 0,
        empty: true,
        message:
          "CV has no content; previous embeddings (doc+chunks) were deleted.",
      };
    }

    // chunking + per-chunk embedding & upsert
    let chunks = chunkText(englishText, 1500);
    this.logger.log(`chunkText produced ${chunks.length} chunks.`);

    // Filter out empty/whitespace-only chunks
    const nonEmptyChunks = (chunks || []).filter(
      (c) => (c || "").toString().trim() !== "",
    );
    if (!nonEmptyChunks || nonEmptyChunks.length === 0) {
      // delete any previously stored chunk-level entries (keep doc-level)
      await this.embeddingModel.deleteMany({
        sourceType: "cv",
        sourceId: cv._id.toString(),
        chunkIndex: { $gte: 0 },
      });

      this.logger.warn(
        `All chunks empty for CV ${cv._id}. Deleted previous chunk-level embeddings. Doc-level left intact (if existed).`,
      );
      return {
        ok: true,
        backend: "mongo",
        indexed: 0,
        reason: "all_chunks_deleted",
      };
    }

    // use nonEmptyChunks going forward
    chunks = nonEmptyChunks;

    // remove leftover chunk documents with index >= new chunks length
    await this.embeddingModel.deleteMany({
      sourceType: "cv",
      sourceId: cv._id.toString(),
      chunkIndex: { $gte: chunks.length },
    });

    this.logger.log(
      `Removed leftover CV chunk docs with chunkIndex >= ${chunks.length} for CV ${cv._id}`,
    );

    const mongoDocsToUpsert: any[] = [];
    let indexedCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      if (!text || text.toString().trim() === "") {
        this.logger.debug(`Skipping empty chunk ${i} for CV ${cv._id}`);
        continue;
      }

      this.logger.debug(
        `Processing CV chunk ${i} length=${text.length} preview="${text
          .slice(0, 120)
          .replace(/\n/g, " ")}"`,
      );

      let embRaw;
      try {
        embRaw = await this.openai.createEmbedding(text);
      } catch (e) {
        this.logger.error(
          `createEmbedding failed for cv=${cv._id} chunk=${i}: ${String(e)}`,
        );
        continue;
      }

      const emb = this.normalizeEmbResp(embRaw);
      if (!emb || emb.length === 0) {
        this.logger.error(`Empty embedding vector for cv=${cv._id} chunk=${i}`);
        continue;
      }

      const metadata = {
        sourceType: "cv",
        sourceId: cv._id.toString(),
        chunkIndex: i,
        fullname: cv.fullname,
        textPreview: text.slice(0, 200),
        originalLanguage: wasTranslated ? "vi" : "en",
        translated: wasTranslated,
        originalTextPreview: finalText.slice(0, 200),
      };

      mongoDocsToUpsert.push({
        sourceType: "cv",
        sourceId: cv._id.toString(),
        chunkIndex: i,
        text,
        embedding: emb,
        metadata,
      });

      indexedCount++;
      this.logger.debug(`Chunk ${i} embedded length=${emb.length}`);
    }

    this.logger.log(
      `Prepared mongoDocs=${mongoDocsToUpsert.length} for CV ${cv._id}`,
    );

    if (mongoDocsToUpsert.length === 0) {
      this.logger.warn(
        `No non-empty chunk embeddings to write for CV ${cv._id}`,
      );
      return {
        ok: true,
        backend: "mongo",
        indexed: 0,
        reason: "no_chunks_indexed",
      };
    }

    this.logger.log(
      `Writing ${mongoDocsToUpsert.length} embeddings to Mongo for CV ${cv._id}`,
    );

    // Upsert chunks (keeps original per-item upsert behavior)
    for (const d of mongoDocsToUpsert) {
      try {
        await this.embeddingModel
          .updateOne(
            {
              sourceType: d.sourceType,
              sourceId: d.sourceId,
              chunkIndex: d.chunkIndex,
            },
            {
              $set: {
                text: d.text,
                embedding: d.embedding,
                metadata: d.metadata,
              },
            },
            { upsert: true },
          )
          .exec();
      } catch (e) {
        this.logger.error(
          "Failed upsert embedding chunk to Mongo (cv) in fallback",
          e,
        );
      }
    }

    this.logger.log(`Indexed ${indexedCount} chunks to Mongo for CV ${cv._id}`);
    return { ok: true, backend: "mongo", indexed: indexedCount };
  }

  /** Index tất cả CV, trả về báo cáo chi tiết */
  async indexAllCvsReport() {
    const cvs = await this.cvModel.find().lean();
    const total = cvs.length;

    let ok = 0;
    let fail = 0;
    let totalIndexed = 0;
    let totalDeletedChunks = 0;

    const details: Array<{
      cvId: string;
      fullname?: string;
      status:
        | "indexed"
        | "empty"
        | "all_chunks_deleted"
        | "no_chunks_indexed"
        | "deleted_only"
        | "failed";
      indexed?: number;
      deletedChunkCount?: number;
      reason?: string | null;
      message?: string | null;
      error?: string | null;
    }> = [];

    for (const cv of cvs) {
      const id = cv._id?.toString?.() ?? String(cv._id);
      try {
        const res: any = await this.indexCv(id);

        const indexed = Number(res?.indexed ?? 0);
        const deletedChunkCount = Number(
          res?.deletedChunkCount ?? res?.deletedCount ?? 0,
        );
        const emptyFlag = !!res?.empty;
        const reason = res?.reason ?? null;
        const message = res?.message ?? null;

        totalIndexed += indexed;
        totalDeletedChunks += deletedChunkCount;
        ok++;

        let status: any = "indexed";
        if (emptyFlag) status = "empty";
        else if (reason === "all_chunks_deleted") status = "all_chunks_deleted";
        else if (reason === "no_chunks_indexed") status = "no_chunks_indexed";
        else if (indexed === 0 && deletedChunkCount > 0)
          status = "deleted_only";
        else if (indexed === 0 && deletedChunkCount === 0)
          status = "no_chunks_indexed";

        details.push({
          cvId: id,
          fullname: cv.fullname,
          status,
          indexed,
          deletedChunkCount,
          reason,
          message,
        });
      } catch (e) {
        fail++;
        const errStr = String(e?.message ?? e);
        this.logger.error(`indexAllCvsReport: failed for ${id}: ${errStr}`);
        details.push({
          cvId: id,
          fullname: cv.fullname,
          status: "failed",
          error: errStr,
        });
      }
    }

    return {
      total,
      ok,
      fail,
      totalIndexed,
      totalDeletedChunks,
      details,
    };
  }

  /** Retrieve topK context passages for a query (Mongo fallback implemented). */
  async retrieve(query: string, topK = 5): Promise<RetrievalResult[]> {
    if (!query || typeof query !== "string" || query.trim() === "") {
      return [];
    }

    const qEmbRaw = await this.openai.createEmbedding(query);
    const qEmb = this.normalizeEmbResp(qEmbRaw);
    if (!qEmb || qEmb.length === 0) return [];

    // fallback to Mongo search
    const MAX_SCAN = Math.max(topK * 20, 2000);

    const docs = await this.embeddingModel
      .find(
        { sourceType: "cv", chunkIndex: { $gte: 0 } },
        { embedding: 1, metadata: 1, text: 1 },
      )
      .limit(MAX_SCAN)
      .lean()
      .exec();

    if (!docs || docs.length === 0) return [];

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const scored = docs
      .map((d: any) => {
        const emb = Array.isArray(d.embedding) ? d.embedding : [];
        if (!emb || emb.length === 0) return null;
        try {
          const sim = this.cosine(qEmb, emb);
          const score = Number.isFinite(sim) ? (sim + 1) / 2 : 0;
          return {
            score,
            text: d.text ?? d.metadata?.textPreview ?? "",
            metadata: d.metadata ?? {},
          } as RetrievalResult;
        } catch {
          return null;
        }
      })
      .filter((r) => r != null) as RetrievalResult[];

    const top = _.orderBy(scored, ["score"], ["desc"]).slice(0, topK);

    return top;
  }

  async retrieveByVector(
    vector: number[],
    topK = 5,
  ): Promise<RetrievalResult[]> {
    if (!vector || !Array.isArray(vector) || vector.length === 0) {
      throw new Error("Query vector is empty");
    }

    const MAX_SCAN = Math.max(topK * 20, 2000);

    const docs = await this.embeddingModel
      .find(
        { sourceType: "cv", chunkIndex: { $gte: 0 } },
        { embedding: 1, metadata: 1, text: 1 },
      )
      .limit(MAX_SCAN)
      .lean()
      .exec();

    if (!docs || docs.length === 0) return [];

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const scored = docs
      .map((d: any) => {
        const emb = Array.isArray(d.embedding) ? d.embedding : [];
        if (!emb || emb.length === 0) return null;
        try {
          const sim = this.cosine(vector, emb);
          const score = Number.isFinite(sim) ? (sim + 1) / 2 : 0;
          return {
            score,
            text: d.text ?? d.metadata?.textPreview ?? "",
            metadata: d.metadata ?? {},
          } as RetrievalResult;
        } catch {
          return null;
        }
      })
      .filter((r) => r != null) as RetrievalResult[];

    const top = _.orderBy(scored, ["score"], ["desc"]).slice(0, topK);

    return top;
  }

  /** Answer a question using retrieved contexts and the chat model. */
  async answer(question: string, topK = 5) {
    const contexts = await this.retrieve(question, topK);

    const system = `You are ConnectJob assistant. Use ONLY the provided context passages to answer. If the answer is not clearly present, say you don't have enough information. Be concise. Cite sources as [cv:<sourceId>#chunk<n>].`;
    const contextText = contexts
      .map(
        (c, i) =>
          `[[${i + 1}] cv:${c.metadata?.sourceId}#chunk${c.metadata?.chunkIndex}] ${c.text ?? ""}`,
      )
      .join("\n\n");

    const userMsg = `Question: ${question}\n\nContexts:\n${contextText}\n\nAnswer concisely and cite like [1], [2] mapped to the contexts above.`;

    const resp = await this.openai.createChatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      600,
    );

    const answer = resp?.choices?.[0]?.message?.content ?? "";
    const sources = contexts.map((c, idx) => ({
      idx: idx + 1,
      sourceId: c.metadata?.sourceId,
      chunk: c.metadata?.chunkIndex,
      score: c.score,
    }));

    return { answer, sources, raw: resp };
  }

  /* ------------------------------------------------------------------------ */
  /* Job: build / index                                                         */
  /* ------------------------------------------------------------------------ */

  /** Build a combined plain-text representation of a Job document. */
  buildJobText(job: any): string {
    const parts: string[] = [];

    parts.push(`Job Title: ${job.title}`);
    if (job.companyName) parts.push(`Company: ${job.companyName}`);
    if (job.companyIndustry) parts.push(`Industry: ${job.companyIndustry}`);
    if (job.department) parts.push(`Department: ${job.department}`);
    if (job.seniority) parts.push(`Seniority: ${job.seniority}`);
    if (job.teamSize) parts.push(`Team size: ${job.teamSize}`);

    if (job.location) {
      const loc = job.location;
      const locStr = [
        loc.city,
        loc.state,
        loc.country,
        loc.remoteType ? `(${loc.remoteType})` : "",
      ]
        .filter(Boolean)
        .join(", ");
      if (locStr) parts.push(`Location: ${locStr}`);
    }

    if (job.description) parts.push(`Description:\n${job.description}`);

    if (job.responsibilities?.length)
      parts.push(
        "Responsibilities:\n" +
          job.responsibilities.map((r: string) => `• ${r}`).join("\n"),
      );

    if (job.requirements?.length)
      parts.push(
        "Requirements:\n" +
          job.requirements.map((r: string) => `• ${r}`).join("\n"),
      );

    if (job.niceToHave?.length)
      parts.push(
        "Nice to have:\n" +
          job.niceToHave.map((n: string) => `• ${n}`).join("\n"),
      );

    if (job.skills?.length) {
      parts.push(
        "Skills: " +
          job.skills
            .map((s: any) => s.name + (s.level ? ` (${s.level})` : ""))
            .join(", "),
      );
    }

    if (job.experienceYears)
      parts.push(`Experience required: ${job.experienceYears} years`);
    if (job.educationLevel)
      parts.push(`Education level: ${job.educationLevel}`);

    if (job.salary) {
      const sal = job.salary;
      const salaryStr = [
        sal.min ? `${sal.min}` : "",
        sal.max ? `–${sal.max}` : "",
        sal.currency ? ` ${sal.currency}` : "",
        sal.period ? ` / ${sal.period}` : "",
      ]
        .join("")
        .trim();

      if (salaryStr) parts.push(`Salary: ${salaryStr}`);
    }

    if (job.benefits?.length)
      parts.push(
        "Benefits:\n" + job.benefits.map((b: string) => `• ${b}`).join("\n"),
      );

    if (job.bonus) parts.push(`Bonus: ${job.bonus}`);
    if (job.equity) parts.push(`Equity: ${job.equity}`);

    if (job.tags?.length) parts.push("Tags: " + job.tags.join(", "));
    if (job.categories?.length)
      parts.push("Categories: " + job.categories.join(", "));

    if (job.preScreenQuestions?.length)
      parts.push(
        "Pre-screen questions:\n" +
          job.preScreenQuestions.map((q: any) => `• ${q.q}`).join("\n"),
      );

    if (parts.length === 0) return "";

    return parts.join("\n\n");
  }

  /** Index one Job (chunk -> embed -> upsert to Mongo). */
  async indexJob(jobId: string) {
    const job = await this.jobModel.findById(jobId).lean();
    if (!job) throw new Error("Job not found");

    this.logger.log(`Indexing Job ${job._id} - title="${job.title}"`);

    const fullText = this.buildJobText(job);
    const finalText = fullText ?? "";

    // prepare normalized metadata for doc-level
    const jobSkillsNormalized = (job.skills || [])
      .map((s: any) => this.normalizeSkillName(s))
      .filter(Boolean);
    const experienceYears = Number(job.experienceYears || 0);
    const jobSeniorityKey = this.extractSeniorityKeyFromText(
      job.seniority || job.title || "",
    );
    const locationNormalized = {
      city: job.location?.city?.toString().toLowerCase?.() || "",
      country: job.location?.country?.toString().toLowerCase?.() || "",
      remote: !!job.remote || job.location?.remoteType === "remote",
    };

    // --- TRANSLATION for job text
    let englishJobText = finalText;
    let jobWasTranslated = false;
    try {
      if (this.isVietnamese(finalText)) {
        this.logger.log(
          `Detected Vietnamese Job content for ${job._id}. Translating before embedding.`,
        );
        const translatedJob = await this.translateToEnglish(finalText);
        if (
          translatedJob &&
          translatedJob.trim().length > 0 &&
          translatedJob !== finalText
        ) {
          englishJobText = translatedJob;
          jobWasTranslated = true;
        }
      }
    } catch (e) {
      this.logger.warn(
        `Translation attempt failed for Job ${job._id}: ${String(e)}`,
      );
      englishJobText = finalText;
      jobWasTranslated = false;
    }

    // doc-level embedding (only if doc is non-empty)
    if (englishJobText && englishJobText.trim().length > 0) {
      try {
        const docEmbRaw = await this.openai.createEmbedding(englishJobText);
        const docEmb = this.normalizeEmbResp(docEmbRaw);
        if (docEmb && docEmb.length) {
          const docMeta = {
            sourceType: "job",
            sourceId: job._id.toString(),
            chunkIndex: -1,
            text: englishJobText.slice(0, 2000),
            embedding: docEmb,
            metadata: {
              docLevel: true,
              jobTitle: job.title,
              companyName: job.companyName,
              textPreview: englishJobText.slice(0, 200),
              jobSkillsNormalized,
              experienceYears,
              seniorityKey: jobSeniorityKey,
              locationNormalized,
              originalLanguage: jobWasTranslated ? "vi" : "en",
              translated: jobWasTranslated,
              originalTextPreview: finalText.slice(0, 200),
            },
          };

          await this.embeddingModel
            .updateOne(
              {
                sourceType: docMeta.sourceType,
                sourceId: docMeta.sourceId,
                chunkIndex: -1,
              },
              {
                $set: {
                  text: docMeta.text,
                  embedding: docMeta.embedding,
                  metadata: docMeta.metadata,
                },
              },
              { upsert: true },
            )
            .exec();

          this.logger.log(
            `Saved document-level embedding for Job ${job._id} (translated=${jobWasTranslated})`,
          );
        }
      } catch (e) {
        this.logger.warn(
          `Failed to create/save doc-level embedding for Job ${job._id}: ${String(e)}`,
        );
      }
    } else {
      // >>> NEW BEHAVIOR: if job text is empty, DO NOT store placeholder.
      await this.embeddingModel.deleteMany({
        sourceType: "job",
        sourceId: job._id.toString(),
      });
      this.logger.warn(
        `Job ${job._id} has no content. Deleted existing embeddings (if any). Nothing indexed.`,
      );
      return {
        ok: true,
        backend: "mongo",
        indexed: 0,
        empty: true,
        message:
          "Job has no content; previous embeddings (doc+chunks) were deleted.",
      };
    }

    // chunking + per-chunk embedding & upsert
    let chunks = chunkText(englishJobText, 1500);
    this.logger.log(`chunkText produced ${chunks.length} chunks.`);

    // Filter out empty/whitespace-only chunks
    chunks = (chunks || []).filter((c) => (c || "").toString().trim() !== "");

    // delete leftover chunk documents whose index >= new chunks length
    await this.embeddingModel.deleteMany({
      sourceType: "job",
      sourceId: job._id.toString(),
      chunkIndex: { $gte: chunks.length },
    });

    this.logger.log(
      `Removed leftover Job chunk docs with chunkIndex >= ${chunks.length} for Job ${job._id}`,
    );

    if (!chunks || chunks.length === 0) {
      // delete previous chunk-level embeddings (keep doc-level if exists)
      await this.embeddingModel.deleteMany({
        sourceType: "job",
        sourceId: job._id.toString(),
        chunkIndex: { $gte: 0 },
      });

      this.logger.warn(
        `All chunks empty for Job ${job._id}. Deleted previous chunk-level embeddings. Doc-level left intact (if existed).`,
      );

      return {
        ok: true,
        backend: "mongo",
        indexed: 0,
        reason: "all_chunks_deleted",
      };
    }

    const mongoDocsToUpsert: any[] = [];
    let indexedCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      if (!text || text.toString().trim() === "") {
        this.logger.debug(`Skipping empty chunk ${i} for Job ${job._id}`);
        continue;
      }

      let embRaw;
      try {
        embRaw = await this.openai.createEmbedding(text);
      } catch (e) {
        this.logger.error(
          `createEmbedding failed for job=${job._id} chunk=${i}: ${String(e)}`,
        );
        continue;
      }

      const emb = this.normalizeEmbResp(embRaw);
      if (!emb || emb.length === 0) {
        this.logger.error(
          `Empty embedding vector for job=${job._id} chunk=${i}`,
        );
        continue;
      }

      const metadata = {
        sourceType: "job",
        sourceId: job._id.toString(),
        chunkIndex: i,
        jobTitle: job.title,
        companyName: job.companyName,
        textPreview: text.slice(0, 200),
        originalLanguage: jobWasTranslated ? "vi" : "en",
        translated: jobWasTranslated,
        originalTextPreview: finalText.slice(0, 200),
      };

      mongoDocsToUpsert.push({
        sourceType: "job",
        sourceId: job._id.toString(),
        chunkIndex: i,
        text,
        embedding: emb,
        metadata,
      });

      indexedCount++;
    }

    if (mongoDocsToUpsert.length === 0) {
      this.logger.warn(
        `No non-empty chunk embeddings to write for Job ${job._id}`,
      );
      return {
        ok: true,
        backend: "mongo",
        indexed: 0,
        reason: "no_chunks_indexed",
      };
    }

    await Promise.all(
      mongoDocsToUpsert.map((d) =>
        this.embeddingModel
          .updateOne(
            {
              sourceType: d.sourceType,
              sourceId: d.sourceId,
              chunkIndex: d.chunkIndex,
            },
            {
              $set: {
                text: d.text,
                embedding: d.embedding,
                metadata: d.metadata,
              },
            },
            { upsert: true },
          )
          .exec()
          .catch((e) => {
            this.logger.error(
              "Failed upsert embedding chunk to Mongo (job) in fallback",
              e,
            );
          }),
      ),
    );

    return { ok: true, backend: "mongo", indexed: indexedCount };
  }

  /** Index tất cả Job, trả về báo cáo chi tiết */
  async indexAllJobsReport() {
    const jobs = await this.jobModel.find().lean();
    const total = jobs.length;

    let ok = 0;
    let fail = 0;
    let totalIndexed = 0;
    let totalDeletedChunks = 0;

    const details: Array<{
      jobId: string;
      jobTitle?: string;
      status:
        | "indexed"
        | "empty"
        | "all_chunks_deleted"
        | "no_chunks_indexed"
        | "deleted_only"
        | "failed";
      indexed?: number;
      deletedChunkCount?: number;
      reason?: string | null;
      message?: string | null;
      error?: string | null;
    }> = [];

    for (const job of jobs) {
      const id = job._id?.toString?.() ?? String(job._id);
      try {
        const res: any = await this.indexJob(id);

        const indexed = Number(res?.indexed ?? 0);
        const deletedChunkCount = Number(
          res?.deletedChunkCount ?? res?.deletedCount ?? 0,
        );
        const emptyFlag = !!res?.empty;
        const reason = res?.reason ?? null;
        const message = res?.message ?? null;

        totalIndexed += indexed;
        totalDeletedChunks += deletedChunkCount;
        ok++;

        let status: any = "indexed";
        if (emptyFlag) status = "empty";
        else if (reason === "all_chunks_deleted") status = "all_chunks_deleted";
        else if (reason === "no_chunks_indexed") status = "no_chunks_indexed";
        else if (indexed === 0 && deletedChunkCount > 0)
          status = "deleted_only";
        else if (indexed === 0 && deletedChunkCount === 0)
          status = "no_chunks_indexed";

        details.push({
          jobId: id,
          jobTitle: job.title,
          status,
          indexed,
          deletedChunkCount,
          reason,
          message,
        });
      } catch (e) {
        fail++;
        const errStr = String(e?.message ?? e);
        this.logger.error(`indexAllJobsReport: failed for ${id}: ${errStr}`);
        details.push({
          jobId: id,
          jobTitle: job.title,
          status: "failed",
          error: errStr,
        });
      }
    }

    return {
      total,
      ok,
      fail,
      totalIndexed,
      totalDeletedChunks,
      details,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Matching: job <-> cv                                                       */
  /* ------------------------------------------------------------------------ */

  /**
   * Match ALL CVs for a Job using doc-level embeddings (chunkIndex = -1).
   * Improved: combine semantic + non-semantic (precomputed metadata) and apply thresholds.
   */
  async matchAllCvsForJobDocLevel(
    jobId: string,
    topK?: number,
    page?: number,
    limit?: number,
  ) {
    if (!jobId) throw new Error("jobId is required");

    // normalize page & limit (optional signature)
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(10, Number(limit) || 10)); // cap 10

    // 1) Lấy job
    const job = await this.jobModel.findById(jobId).lean();
    if (!job) throw new Error("Job not found");

    // 2) Lấy job doc-level embedding (DB hoặc tạo & lưu) — include metadata
    let jobEmb: number[] | undefined;
    let jobMeta: any = {};
    try {
      const jobDoc = await this.embeddingModel
        .findOne(
          { sourceType: "job", sourceId: jobId, chunkIndex: -1 },
          { embedding: 1, metadata: 1 },
        )
        .lean();

      if (
        jobDoc?.embedding &&
        Array.isArray(jobDoc.embedding) &&
        jobDoc.embedding.length
      ) {
        jobEmb = jobDoc.embedding as number[];
        jobMeta = jobDoc.metadata || {};
      } else {
        const jobText = this.buildJobText(job) || "";
        if (jobText.trim().length === 0)
          throw new Error("Job has no text to embed");

        // translate if necessary before embedding
        let jobTextToEmbed = jobText;
        try {
          if (this.isVietnamese(jobText)) {
            jobTextToEmbed = await this.translateToEnglish(jobText);
          }
        } catch (e) {
          this.logger.warn(
            `Translation fallback in matchAllCvsForJobDocLevel: ${String(e)}`,
          );
          jobTextToEmbed = jobText;
        }

        const embRaw = await this.openai.createEmbedding(jobTextToEmbed);
        const emb = this.normalizeEmbResp(embRaw);
        if (!emb || !Array.isArray(emb) || emb.length === 0)
          throw new Error("Failed to create job doc-level embedding");
        jobEmb = emb;

        // prepare metadata to persist (same as indexJob)
        const jobSkillsNormalized = (job.skills || [])
          .map((s: any) => this.normalizeSkillName(s))
          .filter(Boolean);
        const experienceYears = Number(job.experienceYears || 0);
        const jobSeniorityKey = this.extractSeniorityKeyFromText(
          job.seniority || job.title || "",
        );
        const locationNormalized = {
          city: job.location?.city?.toString().toLowerCase?.() || "",
          country: job.location?.country?.toString().toLowerCase?.() || "",
          remote: !!job.remote || job.location?.remoteType === "remote",
        };

        jobMeta = {
          jobSkillsNormalized,
          experienceYears,
          seniorityKey: jobSeniorityKey,
          locationNormalized,
        };

        await this.embeddingModel
          .updateOne(
            { sourceType: "job", sourceId: jobId, chunkIndex: -1 },
            {
              $set: {
                text: jobTextToEmbed.slice(0, 2000),
                embedding: emb,
                metadata: {
                  docLevel: true,
                  jobTitle: job.title,
                  companyName: job.companyName,
                  textPreview: jobTextToEmbed.slice(0, 200),
                  ...jobMeta,
                },
              },
            },
            { upsert: true },
          )
          .exec();
      }
    } catch (err) {
      this.logger.error(
        `matchAllCvsForJobDocLevel: failed to ensure job embedding: ${String(err)}`,
      );
      throw err;
    }

    if (!jobEmb || !Array.isArray(jobEmb) || jobEmb.length === 0) {
      throw new Error("Job doc-level embedding unavailable");
    }

    // 3) Lấy tất cả CV doc-level embeddings (we rely on precomputed cv metadata)
    const cvEmbDocs = await this.embeddingModel
      .find(
        { sourceType: "cv", chunkIndex: -1 },
        { embedding: 1, sourceId: 1, metadata: 1 },
      )
      .lean()
      .exec();

    if (!cvEmbDocs || cvEmbDocs.length === 0) {
      return {
        jobId,
        jobTitle: job.title,
        page: pageNum,
        limit: limitNum,
        totalItems: 0,
        totalPages: 0,
        returned: 0,
        matches: [],
        message: "No CVs with doc-level embeddings found (chunkIndex=-1).",
      };
    }

    // 4) scoring: combine semantic + non-semantic (use metadata to avoid loading full CV)
    const W_SEM = 0.5;
    const W_NON = 0.5;
    const MIN_SEMANTIC = 0.5;
    const MIN_FINAL = 0.62;
    const MIN_SKILL_SCORE = 0.4;

    const jobSkills = (jobMeta.jobSkillsNormalized || []).map((s: string) =>
      s.toString().toLowerCase(),
    );
    const jobSkillsSet = new Set(jobSkills);
    const jobExpReq = Number(jobMeta.experienceYears || 0);
    const jobSenKey = (jobMeta.seniorityKey || "").toString().toLowerCase();
    const jobLocMeta = jobMeta.locationNormalized || {};

    const seniorityRank: Record<string, number> = {
      intern: 0,
      entry: 0.5,
      junior: 1,
      mid: 2,
      senior: 3,
      lead: 4,
      manager: 5,
      director: 6,
      vp: 7,
      c: 8,
    };

    const scored = cvEmbDocs
      .map((cv: any) => {
        const emb = Array.isArray(cv.embedding) ? cv.embedding : [];
        if (!emb || emb.length === 0) return null;
        try {
          const cos = this.cosine(jobEmb!, emb); // -1..1
          const semantic = Math.max(0, Math.min(1, (cos + 1) / 2)); // 0..1

          // metadata from CV
          const md = cv.metadata || {};
          const cvSkills = (md.skillsNormalized || []).map((s: string) =>
            s.toString().toLowerCase(),
          );
          const cvYears = Number(md.candYears || 0);
          const cvSenKey = (md.seniorityKey || "").toString().toLowerCase();
          const cvLoc = md.locationNormalized || {};

          // skills score
          let skillsScore = 0;
          if (jobSkills.length > 0 && cvSkills.length > 0) {
            const matchCount = cvSkills.filter((s: string) =>
              jobSkillsSet.has(s),
            ).length;
            skillsScore = Math.max(
              0,
              Math.min(1, matchCount / Math.max(1, jobSkills.length)),
            );
          } else {
            skillsScore = jobSkills.length === 0 ? 1 : 0; // neutral if job had no skills listed
          }

          // experience
          const expScore =
            jobExpReq <= 0 ? 1 : Math.min(1, cvYears / jobExpReq);

          // seniority
          const jobRank = seniorityRank[jobSenKey] ?? null;
          const cvRank = seniorityRank[cvSenKey] ?? null;
          let seniorityScore = 0.5;
          if (jobRank != null && cvRank != null) {
            const diff = Math.abs(jobRank - cvRank);
            seniorityScore = Math.max(0, 1 - diff / Math.max(1, jobRank));
          }

          // location
          let locationScore = 0.5;
          try {
            const jobRemote = !!jobLocMeta?.remote;
            const cvRemote = !!cvLoc?.remote;
            if (jobRemote && cvRemote) locationScore = 1;
            else if (jobRemote && !cvRemote) locationScore = 0.7;
            else if (!jobRemote && cvRemote) locationScore = 0.7;
            else {
              const jcity = (jobLocMeta?.city || "")
                .toString()
                .toLowerCase()
                .trim();
              const jcountry = (jobLocMeta?.country || "")
                .toString()
                .toLowerCase()
                .trim();
              const ccity = (cvLoc?.city || "").toString().toLowerCase().trim();
              const ccountry = (cvLoc?.country || "")
                .toString()
                .toLowerCase()
                .trim();
              if (jcity && ccity && jcity === ccity) locationScore = 1;
              else if (jcountry && ccountry && jcountry === ccountry)
                locationScore = 0.9;
              else locationScore = 0.4;
            }
          } catch {
            locationScore = 0.5;
          }

          const nonSemanticCombined =
            skillsScore * 0.6 +
            expScore * 0.2 +
            seniorityScore * 0.1 +
            locationScore * 0.1;

          const finalScore = W_SEM * semantic + W_NON * nonSemanticCombined;

          // apply filters
          if (semantic < MIN_SEMANTIC) return null;
          if (finalScore < MIN_FINAL) return null;
          if (jobSkills.length > 0 && skillsScore < MIN_SKILL_SCORE)
            return null;

          return {
            cvId: cv.sourceId,
            fullname: md.fullname ?? null,
            semantic: Math.round(semantic * 100),
            skillsScore: Math.round(skillsScore * 100),
            nonSemantic: Math.round(nonSemanticCombined * 100),
            score: Math.round(finalScore * 100),
            textPreview: md.textPreview ?? null,
          };
        } catch (e) {
          this.logger.warn(
            `Cosine/score failed for cv ${cv.sourceId}: ${String(e)}`,
          );
          return null;
        }
      })
      .filter(Boolean) as Array<any>;

    let sorted = _.orderBy(scored, ["score"], ["desc"]);

    if (typeof topK === "number" && topK > 0) sorted = sorted.slice(0, topK);

    const totalItems = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limitNum));
    const start = (pageNum - 1) * limitNum;
    const pageSlice = sorted.slice(start, start + limitNum);

    return {
      jobId,
      jobTitle: job.title,
      page: pageNum,
      limit: limitNum,
      totalItems,
      totalPages,
      returned: pageSlice.length,
      matches: pageSlice.map((m) => ({
        cvId: m.cvId,
        fullname: m.fullname,
        score: m.score,
        semantic: m.semantic,
        skillsScore: m.skillsScore,
        nonSemantic: m.nonSemantic,
        textPreview: m.textPreview,
      })),
    };
  }

  /**
   * Match ALL Jobs for a CV using doc-level embeddings (chunkIndex = -1).
   * page?: number, limit?: number (limit default/capped = 10)
   * topK?: number (applied before pagination)
   */
  async matchAllJobsForCvDocLevel(
    cvId: string,
    topK?: number,
    page?: number,
    limit?: number,
  ) {
    if (!cvId) throw new Error("cvId is required");

    // normalize page & limit
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(10, Number(limit) || 10)); // cap 10

    // 1) load CV
    const cv = await this.cvModel.findById(cvId).lean();
    if (!cv) throw new Error("CV not found");

    // 2) ensure CV doc-level embedding exists
    let cvEmb: number[] | undefined;
    let cvMeta: any = {};
    try {
      const cvDoc = await this.embeddingModel
        .findOne(
          { sourceType: "cv", sourceId: cvId, chunkIndex: -1 },
          { embedding: 1, metadata: 1 },
        )
        .lean();

      if (
        cvDoc?.embedding &&
        Array.isArray(cvDoc.embedding) &&
        cvDoc.embedding.length
      ) {
        cvEmb = cvDoc.embedding as number[];
        cvMeta = cvDoc.metadata || {};
      } else {
        const cvText = this.buildCvText(cv) || "";
        if (cvText.trim().length === 0)
          throw new Error("CV has no text to embed");

        // translate before embedding if necessary
        let cvTextToEmbed = cvText;
        try {
          if (this.isVietnamese(cvText)) {
            cvTextToEmbed = await this.translateToEnglish(cvText);
          }
        } catch (e) {
          this.logger.warn(
            `Translation fallback in matchAllJobsForCvDocLevel: ${String(e)}`,
          );
          cvTextToEmbed = cvText;
        }

        const embRaw = await this.openai.createEmbedding(cvTextToEmbed);
        const emb = this.normalizeEmbResp(embRaw);
        if (!emb || !Array.isArray(emb) || emb.length === 0)
          throw new Error("Failed to create CV doc-level embedding");
        cvEmb = emb;

        // compute small metadata
        const normalizedSkills = (cv.skills || [])
          .map((s: any) => this.normalizeSkillName(s))
          .filter(Boolean);
        const candYears = this.computeCandYearsFromCv(cv);
        const seniorityKey = this.extractSeniorityKeyFromText(
          `${cv.targetRole || ""} ${cv.headline || ""}`,
        );
        const locationNormalized = {
          city: (cv.location?.city || "").toString().toLowerCase(),
          country: (cv.location?.country || "").toString().toLowerCase(),
          remote:
            !!(cv as any).remote ||
            (cv.location as any)?.remoteType === "remote",
        };

        cvMeta = {
          skillsNormalized: normalizedSkills,
          candYears,
          seniorityKey,
          locationNormalized,
        };

        await this.embeddingModel
          .updateOne(
            { sourceType: "cv", sourceId: cvId, chunkIndex: -1 },
            {
              $set: {
                text: cvTextToEmbed.slice(0, 2000),
                embedding: emb,
                metadata: {
                  docLevel: true,
                  fullname: cv.fullname,
                  textPreview: cvTextToEmbed.slice(0, 200),
                  ...cvMeta,
                },
              },
            },
            { upsert: true },
          )
          .exec();
      }
    } catch (err) {
      this.logger.error(
        `matchAllJobsForCvDocLevel: failed to ensure cv embedding: ${String(err)}`,
      );
      throw err;
    }

    if (!cvEmb || !Array.isArray(cvEmb) || cvEmb.length === 0) {
      throw new Error("CV doc-level embedding unavailable");
    }

    // 3) fetch all job doc-level embeddings
    const jobEmbDocs = await this.embeddingModel
      .find(
        { sourceType: "job", chunkIndex: -1 },
        { embedding: 1, sourceId: 1, metadata: 1 },
      )
      .lean()
      .exec();

    if (!jobEmbDocs || jobEmbDocs.length === 0) {
      return {
        cvId,
        fullname: cv.fullname ?? null,
        page: pageNum,
        limit: limitNum,
        totalItems: 0,
        totalPages: 0,
        returned: 0,
        matches: [],
        message: "No Jobs with doc-level embeddings found (chunkIndex=-1).",
      };
    }

    // reuse symmetric scoring logic but flip job/cv
    const W_SEM = 0.7;
    const W_NON = 0.3;
    const MIN_SEMANTIC = 0.45;
    const MIN_FINAL = 0.5;

    const cvSkills = (cvMeta.skillsNormalized || []).map((s: string) =>
      s.toString().toLowerCase(),
    );
    const cvSkillsSet = new Set(cvSkills);
    const cvYears = Number(cvMeta.candYears || 0);
    const cvSenKey = (cvMeta.seniorityKey || "").toString().toLowerCase();
    const cvLocMeta = cvMeta.locationNormalized || {};

    const seniorityRankMap: Record<string, number> = {
      intern: 0,
      entry: 0.5,
      junior: 1,
      mid: 2,
      senior: 3,
      lead: 4,
      manager: 5,
      director: 6,
      vp: 7,
      c: 8,
    };

    const scoredJobs = jobEmbDocs
      .map((jobDoc: any) => {
        const emb = Array.isArray(jobDoc.embedding) ? jobDoc.embedding : [];
        if (!emb || emb.length === 0) return null;
        try {
          const cos = this.cosine(cvEmb!, emb);
          const semantic = Math.max(0, Math.min(1, (cos + 1) / 2));

          const md = jobDoc.metadata || {};
          const jobSkillsArr = (md.jobSkillsNormalized || []).map((s: string) =>
            s.toString().toLowerCase(),
          );
          const jobSkillsSet2 = new Set(jobSkillsArr);

          let skillsScore = 0;
          if (jobSkillsArr.length > 0 && cvSkills.length > 0) {
            const matchCount = cvSkills.filter((s: string) =>
              jobSkillsSet2.has(s),
            ).length;
            skillsScore = Math.max(
              0,
              Math.min(1, matchCount / Math.max(1, jobSkillsArr.length)),
            );
          } else {
            skillsScore = jobSkillsArr.length === 0 ? 1 : 0;
          }

          const jobExpReq = Number(
            md.experienceYears || md.experienceYears || 0,
          );
          const expScore =
            jobExpReq <= 0 ? 1 : Math.min(1, cvYears / jobExpReq);

          const jobRank =
            seniorityRankMap[
              (md.seniorityKey || "").toString().toLowerCase()
            ] ?? null;
          const cvRank = seniorityRankMap[cvSenKey] ?? null;
          let seniorityScore = 0.5;
          if (jobRank != null && cvRank != null) {
            const diff = Math.abs(jobRank - cvRank);
            seniorityScore = Math.max(0, 1 - diff / Math.max(1, jobRank));
          }

          // location
          let locationScore = 0.5;
          try {
            const jobLoc = md.locationNormalized || {};
            const jobRemote = !!jobLoc?.remote;
            const cvRemote = !!cvLocMeta?.remote;
            if (jobRemote && cvRemote) locationScore = 1;
            else if (jobRemote && !cvRemote) locationScore = 0.7;
            else if (!jobRemote && cvRemote) locationScore = 0.7;
            else {
              const jcity = (jobLoc?.city || "")
                .toString()
                .toLowerCase()
                .trim();
              const jcountry = (jobLoc?.country || "")
                .toString()
                .toLowerCase()
                .trim();
              const ccity = (cvLocMeta?.city || "")
                .toString()
                .toLowerCase()
                .trim();
              const ccountry = (cvLocMeta?.country || "")
                .toString()
                .toLowerCase()
                .trim();
              if (jcity && ccity && jcity === ccity) locationScore = 1;
              else if (jcountry && ccountry && jcountry === ccountry)
                locationScore = 0.9;
              else locationScore = 0.4;
            }
          } catch {
            locationScore = 0.5;
          }

          const nonSemanticCombined =
            skillsScore * 0.6 +
            expScore * 0.2 +
            seniorityScore * 0.1 +
            locationScore * 0.1;
          const finalScore = W_SEM * semantic + W_NON * nonSemanticCombined;

          if (semantic < MIN_SEMANTIC) return null;
          if (finalScore < MIN_FINAL) return null;
          if (jobSkillsArr.length > 0 && skillsScore < 0.2) return null;

          return {
            jobId: jobDoc.sourceId,
            jobTitle: md.jobTitle ?? null,
            companyName: md.companyName ?? null,
            semantic: Math.round(semantic * 100),
            skillsScore: Math.round(skillsScore * 100),
            nonSemantic: Math.round(nonSemanticCombined * 100),
            score: Math.round(finalScore * 100),
            textPreview: md.textPreview ?? null,
          };
        } catch (e) {
          this.logger.warn(
            `Cosine/score failed for job ${jobDoc.sourceId}: ${String(e)}`,
          );
          return null;
        }
      })
      .filter(Boolean) as Array<any>;

    let sorted = _.orderBy(scoredJobs, ["score"], ["desc"]);
    if (typeof topK === "number" && topK > 0) sorted = sorted.slice(0, topK);

    const totalItems = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limitNum));
    const start = (pageNum - 1) * limitNum;
    const pageSlice = sorted.slice(start, start + limitNum);

    return {
      cvId,
      fullname: cv.fullname ?? null,
      page: pageNum,
      limit: limitNum,
      totalItems,
      totalPages,
      returned: pageSlice.length,
      matches: pageSlice.map((m) => ({
        jobId: m.jobId,
        jobTitle: m.jobTitle,
        companyName: m.companyName,
        score: m.score,
        semantic: m.semantic,
        skillsScore: m.skillsScore,
        nonSemantic: m.nonSemantic,
        textPreview: m.textPreview,
      })),
    };
  }
  /**
   * Chunk-level matching between one Job and one CV (one-to-one).
   * Returns topK matching chunk pairs sorted by score desc.
   */
  // params: jobId, cvId, topK = 10, opts?: { minScore?: number, minSkillScore?: number, requireSkillOverlap?: boolean }
  // replace existing matchJobCvChunkLevel with this version
  async matchJobCvChunkLevel(
    jobId: string,
    cvId: string,
    topK = 10,
    opts?: {
      minScore?: number;
      minSkillScore?: number;
      requireSkillOverlap?: boolean;
    },
  ) {
    if (!jobId || !cvId) throw new Error("jobId and cvId are required");

    // Keep defaults but we won't use filters to drop data (we only compute them if needed)
    const MIN_SCORE = typeof opts?.minScore === "number" ? opts.minScore : 0.0;
    const MIN_SKILL =
      typeof opts?.minSkillScore === "number" ? opts.minSkillScore : 0.0;
    const REQUIRE_SKILL = !!opts?.requireSkillOverlap;

    // fetch job chunk embeddings
    const jobChunks = await this.embeddingModel
      .find(
        { sourceType: "job", sourceId: jobId, chunkIndex: { $gte: 0 } },
        { embedding: 1, metadata: 1, text: 1, chunkIndex: 1 },
      )
      .lean()
      .exec();

    // fetch cv chunk embeddings
    const cvChunks = await this.embeddingModel
      .find(
        { sourceType: "cv", sourceId: cvId, chunkIndex: { $gte: 0 } },
        { embedding: 1, metadata: 1, text: 1, chunkIndex: 1 },
      )
      .lean()
      .exec();

    if (!jobChunks || jobChunks.length === 0) {
      return {
        jobId,
        cvId,
        totalPairs: 0,
        allPairs: [],
        finalOverallScoreDecimal: 0,
        finalOverallScore: 0,
      };
    }
    if (!cvChunks || cvChunks.length === 0) {
      return {
        jobId,
        cvId,
        totalPairs: 0,
        allPairs: [],
        finalOverallScoreDecimal: 0,
        finalOverallScore: 0,
      };
    }

    // try to get job-level skills from doc-level embedding metadata (if present)
    const jobDoc = await this.embeddingModel
      .findOne(
        { sourceType: "job", sourceId: jobId, chunkIndex: -1 },
        { metadata: 1 },
      )
      .lean();
    const jobSkillsArr: string[] = jobDoc?.metadata?.jobSkillsNormalized || [];
    const jobSkillsSet = new Set(
      (jobSkillsArr || []).map((s: string) =>
        (s || "").toString().toLowerCase().trim(),
      ),
    );

    // try to get cv-level skills from doc-level embedding metadata (if present)
    const cvDoc = await this.embeddingModel
      .findOne(
        { sourceType: "cv", sourceId: cvId, chunkIndex: -1 },
        { metadata: 1 },
      )
      .lean();
    const cvSkillsDocArr: string[] = cvDoc?.metadata?.skillsNormalized || [];

    const allPairs: Array<any> = [];

    // weights when job has skills; else finalScore uses semantic only
    const W_SEM = 0.7;
    const W_SKILL = 0.3;

    for (const jDoc of jobChunks) {
      const jEmb = Array.isArray(jDoc.embedding) ? jDoc.embedding : [];
      if (!jEmb || jEmb.length === 0) continue;

      for (const cDoc of cvChunks) {
        const cEmb = Array.isArray(cDoc.embedding) ? cDoc.embedding : [];
        if (!cEmb || cEmb.length === 0) continue;

        try {
          const cos = this.cosine(jEmb, cEmb); // -1..1
          const semantic = Number.isFinite(cos) ? (cos + 1) / 2 : 0; // 0..1

          // collect skills: try chunk metadata first then doc-level fallback
          const cvSkillsChunkArr: string[] =
            cDoc.metadata?.skillsNormalized || [];
          const cvSkillsArr =
            (cvSkillsChunkArr.length > 0 ? cvSkillsChunkArr : cvSkillsDocArr) ||
            [];

          let skillScore = 0;
          if (jobSkillsArr.length > 0 && cvSkillsArr.length > 0) {
            const cvLower = cvSkillsArr.map((s: string) =>
              (s || "").toString().toLowerCase().trim(),
            );
            const matched = cvLower.filter((s: string) =>
              jobSkillsSet.has(s),
            ).length;
            skillScore = Math.max(
              0,
              Math.min(1, matched / Math.max(1, jobSkillsArr.length)),
            );
          } else {
            skillScore = 0;
          }

          // finalScore: if job has skills then weighted sum else semantic-only
          const finalScore =
            jobSkillsArr.length > 0
              ? W_SEM * semantic + W_SKILL * skillScore
              : semantic;

          const pair = {
            jobChunkIndex: jDoc.chunkIndex,
            cvChunkIndex: cDoc.chunkIndex,
            semantic: Math.round(semantic * 100),
            skillScore: Math.round(skillScore * 100),
            finalScoreDecimal: Number(finalScore.toFixed(4)),
            score: Math.round(finalScore * 100), // 0..100 integer
            jobText: jDoc.text ?? jDoc.metadata?.textPreview ?? "",
            cvText: cDoc.text ?? cDoc.metadata?.textPreview ?? "",
            jobMeta: jDoc.metadata ?? {},
            cvMeta: cDoc.metadata ?? {},
          };

          // push ALL pairs (preserve for evaluation)
          allPairs.push(pair);
        } catch (e) {
          this.logger.warn(
            `matchJobCvChunkLevel: cosine failed for job ${jobId} chunk ${jDoc.chunkIndex} vs cv ${cvId} chunk ${cDoc.chunkIndex}: ${String(
              e,
            )}`,
          );
        }
      }
    }

    // compute overall best score
    let finalOverallScoreDecimal = 0;
    if (allPairs.length > 0) {
      finalOverallScoreDecimal = allPairs.reduce(
        (mx, p) => Math.max(mx, p.finalScoreDecimal ?? 0),
        0,
      );
    }
    const finalOverallScore = Math.round(finalOverallScoreDecimal * 100);

    return {
      jobId,
      cvId,
      totalPairs: allPairs.length,
      // only the two items you required:
      allPairs,
      finalOverallScoreDecimal,
      finalOverallScore, // 0..100 int
    };
  }
}
