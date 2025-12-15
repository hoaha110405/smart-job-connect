/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-require-imports */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  forwardRef,
  Inject,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CreateCvDto } from "./dto/create-cv.dto";
import { Cv } from "./schemas/cv.schema";
// import { RagService } from "../rag/rag.service";
import { Model as MModel } from "mongoose";
import { Job } from "../job/schemas/job.schema";
import axios, { AxiosInstance } from "axios";
import { ConfigService } from "@nestjs/config";
import { Readable } from "stream";
import FormData = require("form-data");
import { RagService } from "../rag/rag.service";

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);
  private client: AxiosInstance;
  private baseUrl: string;

  private enrichCv(doc: any) {
    if (!doc) return doc;

    const obj = doc.toObject ? doc.toObject() : doc;

    const hasFile = !!obj.file?.filename;

    let fileType: "pdf" | "bdf" | null = null;
    if (obj.file?.mimetype === "application/pdf") {
      fileType = "pdf";
    }
    if (obj.file?.mimetype === "application/x-font-bdf") {
      fileType = "bdf";
    }

    return {
      ...obj,
      hasFile,
      fileType,
      downloadUrl: hasFile ? `/cv/file/${obj.file.filename}` : null,
    };
  }

  constructor(
    @InjectModel(Cv.name) private readonly cvModel: Model<Cv>,
    @InjectModel(Job.name) private readonly jobModel: MModel<Job>, // <-- thêm dòng này
    @Inject(forwardRef(() => RagService))
    private readonly ragService: RagService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl =
      this.config.get<string>("FASTAPI_BASE_URL") || "http://localhost:8000";
    const timeout = Number(
      this.config.get<number>("FASTAPI_TIMEOUT_MS") || 120000,
    );
    this.client = axios.create({ baseURL: this.baseUrl, timeout });
  }

  async create(createCvDto: CreateCvDto, user_id: string) {
    try {
      const created = new this.cvModel({ ...createCvDto, createdBy: user_id });
      const saved = await created.save();

      // fire-and-forget indexing: await but catch errors so create still returns success
      try {
        // indexCv expects a string id
        await this.ragService.indexCv(saved._id.toString());
        this.logger.log(`CV ${saved._id} indexed in RAG.`);
      } catch (indexErr) {
        // do not throw — we want create to succeed even if indexing fails
        this.logger.error(
          `Failed to index CV ${saved._id} in RAG: ${String(indexErr)}`,
        );
      }

      return this.enrichCv(saved);
    } catch (err) {
      throw new BadRequestException(err || "Failed to create CV");
    }
  }

  /**
   * Simple paginated list with optional filters.
   * filters: { userId, fullname, tags, status }
   */
  async findAll(options?: {
    page?: number;
    limit?: number;
    filters?: any;
    search?: string;
    sort?: string; // latest | oldest
  }) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.max(1, Math.min(100, options?.limit ?? 20));
    const skip = (page - 1) * limit;
    const filters = options?.filters ?? {};

    // --- search by name ---
    if (options?.search) {
      const regex = new RegExp(options.search.trim(), "i");
      filters.fullname = regex;
    }

    // --- sort ---
    let sortOption: any = { createdAt: -1 }; // default: newest first
    if (options?.sort === "oldest") sortOption = { createdAt: 1 };

    const query = this.cvModel
      .find(filters)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    const [items, total] = await Promise.all([
      query.exec(),
      this.cvModel.countDocuments(filters).exec(),
    ]);

    return {
      items: items.map((cv) => this.enrichCv(cv)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const doc = await this.cvModel.findById(id).exec();
    if (!doc) throw new NotFoundException(`CV ${id} not found`);
    return this.enrichCv(doc);
  }

  async update(id: string, payload: Partial<CreateCvDto>) {
    const doc = await this.cvModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!doc) throw new NotFoundException(`CV ${id} not found`);
    return doc;
  }

  async remove(id: string) {
    const doc = await this.cvModel.findByIdAndDelete(id).exec();
    if (!doc) throw new NotFoundException(`CV ${id} not found`);
    return { deleted: true, id };
  }

  // simple search by skills/name/targetRole (example)
  async search(term: string, options?: { limit?: number }) {
    const limit = options?.limit ?? 20;
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const items = await this.cvModel
      .find({
        $or: [
          { fullname: regex },
          { preferredName: regex },
          { targetRole: regex },
          { "skills.name": regex },
          { headline: regex },
          { summary: regex },
        ],
      })
      .limit(limit)
      .exec();
    return items.map((cv) => this.enrichCv(cv));
  }

  async findByUser(userId: string) {
    if (!userId) {
      throw new BadRequestException("Missing userId");
    }

    const docs = await this.cvModel
      .find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .exec();

    return docs.map((cv) => this.enrichCv(cv));
  }

  async rename(id: string, newName: string) {
    if (!newName || newName.trim() === "") {
      throw new BadRequestException("New name is required");
    }

    const updated = await this.cvModel
      .findByIdAndUpdate(
        id,
        { fullname: newName, updatedAt: new Date() },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`CV ${id} not found`);
    }

    return updated;
  }

  //////////////////////////////////////////// FASTAPI INTEGRATION ////////////////////////////////////////////
  // trong CvService (chỉ đoạn thêm/sửa)
  async uploadToFastApi(file: {
    originalname: string;
    buffer?: Buffer;
    stream?: Readable;
    mimetype?: string;
  }): Promise<any> {
    const form = new FormData();
    if (file.buffer) {
      form.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype || "application/octet-stream",
      });
    } else if (file.stream) {
      form.append("file", file.stream, {
        filename: file.originalname,
        contentType: file.mimetype || "application/octet-stream",
      });
    } else {
      throw new Error("No buffer or stream provided");
    }

    const headers = Object.assign({}, form.getHeaders());
    try {
      const res = await this.client.post("/upload", form, {
        headers,
        maxBodyLength: Infinity,
      });
      // trả về toàn bộ res.data để controller có thể dùng raw nếu cần
      return res.data;
    } catch (e: any) {
      this.logger.error(
        "uploadToFastApi error",
        e?.response?.data || e?.message || e,
      );
      throw e;
    }
  }

  /**
   * Normalize và tạo CV từ response FastAPI.
   * fastApiRes: toàn bộ object trả về từ axios (res.data)
   * fileMeta: { filename, originalname, path?, mimetype?, size?, uploadedAt? }
   * userId: id người dùng làm createdBy
   */
  async createFromFastApiResponse(
    fastApiRes: any,
    fileMeta: {
      filename?: string;
      originalname?: string;
      path?: string;
      mimetype?: string;
      size?: number;
      uploadedAt?: string | Date;
    },
    userId: string,
  ) {
    // helper parse date-like values robustly
    const parseToDate = (v: any): Date | undefined => {
      if (v == null) return undefined;
      if (v instanceof Date && !isNaN(v.getTime())) return v;
      if (typeof v !== "string") return undefined;
      const s = v.trim();
      if (s === "" || /^(present|now|current)$/i.test(s)) return undefined;
      // try ISO parse
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d;
      // try year-only like "2024"
      const y = parseInt(s, 10);
      if (!isNaN(y) && y > 1900 && y < 2100) return new Date(y, 0, 1);
      return undefined;
    };

    // find result in possible shapes: { result }, { data: { result } }, { data }
    const result =
      fastApiRes?.result ??
      fastApiRes?.data?.result ??
      fastApiRes?.data ??
      fastApiRes;

    if (!result || Object.keys(result).length === 0) {
      throw new Error("Empty result from FastAPI");
    }

    // normalize arrays and date fields
    const normExperiences = (result.experiences || []).map((e: any) => ({
      ...e,
      from: parseToDate(e?.from),
      to: parseToDate(e?.to),
      // if isCurrent present and to is undefined, keep isCurrent as boolean
      isCurrent:
        typeof e?.isCurrent === "boolean"
          ? e.isCurrent
          : /present|now|current/i.test(e?.to ?? ""),
    }));

    const normEducation = (result.education || []).map((ed: any) => ({
      ...ed,
      from: parseToDate(ed?.from),
      to: parseToDate(ed?.to),
    }));

    const normProjects = (result.projects || []).map((p: any) => ({
      ...p,
      from: parseToDate(p?.from),
      to: parseToDate(p?.to),
    }));

    const normCerts = (result.certifications || []).map((c: any) => ({
      ...c,
      issueDate: parseToDate(c?.issueDate) || c?.issueDate,
      expiryDate: parseToDate(c?.expiryDate) || c?.expiryDate,
    }));

    // prepare CreateCvDto-like payload
    const payload: any = {
      fullname: result.fullname || result.name || "Unknown",
      preferredName: result.preferredName,
      avatarUrl: result.avatarUrl,
      email: result.email,
      phone: result.phone,
      location: result.location,
      headline: result.headline,
      summary: result.summary,
      targetRole: result.targetRole,
      employmentType: result.employmentType,
      salaryExpectation: result.salaryExpectation,
      availability: result.availability,
      skills: result.skills || [],
      experiences: normExperiences,
      education: normEducation,
      projects: normProjects,
      certifications: normCerts,
      languages: result.languages || [],
      portfolio: result.portfolio || [],
      references: result.references || [],
      tags: result.tags || [],
      status: result.status || "draft",
      version: typeof result.version === "number" ? result.version : 0,
      // thêm file metadata vào field `file`
      file: {
        filename: fileMeta.filename ?? fileMeta.originalname,
        originalname: fileMeta.originalname,
        path: fileMeta.path,
        mimetype: fileMeta.mimetype,
        size: fileMeta.size,
        uploadedAt: fileMeta.uploadedAt
          ? new Date(fileMeta.uploadedAt)
          : new Date(),
      },
    };

    // dùng service.create để lưu (và index trong RAG)
    const saved = await this.create(payload, userId);
    return { saved, raw: result };
  }
}
