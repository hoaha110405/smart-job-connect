/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// import { RagService } from "./../rag/rag.service";
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Put,
  Delete,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Request,
  Patch,
  UseInterceptors,
  UploadedFile,
  HttpException,
  Logger,
  Res,
} from "@nestjs/common";
import { CvService } from "./cv.service";
import { CreateCvDto } from "./dto/create-cv.dto";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import type { Request as ExRequest } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import * as fsSync from "fs";
import { extname, join } from "path";
import * as fs from "fs/promises"; // readFile, unlink, stat...
import { diskStorage } from "multer";
import type { Response } from "express";
import * as path from "path";
import { lookup as mimeLookup } from "mime-types";

@Controller("cv")
export class CvController {
  private readonly logger = new Logger(CvService.name);
  private readonly uploadDir: string;

  constructor(private readonly cvService: CvService) {
    this.uploadDir = process.env.LOCAL_CV_DIR || "./uploads/cvs";
    fsSync.mkdirSync(this.uploadDir, { recursive: true });
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  )
  async create(@Body() createCvDto: CreateCvDto, @Request() req: ExRequest) {
    console.log("User creating CV:", (req.user as any).userId);
    return this.cvService.create(
      createCvDto,
      (req.user as any).userId as string,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get("user/me")
  async getMyCvs(@Request() req: ExRequest) {
    const userId = (req.user as any).userId;
    return this.cvService.findByUser(userId);
  }

  @Get()
  async findAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("userId") userId?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("sort") sort?: string, // latest | oldest
  ) {
    const filters: any = {};

    if (userId) filters.createdBy = userId;
    if (status) filters.status = status;

    return this.cvService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      filters,
      search,
      sort,
    });
  }

  @Get("search")
  async search(@Query("q") q: string, @Query("limit") limit?: string) {
    if (!q) return [];
    return this.cvService.search(q, {
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.cvService.findOne(id);
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() payload: Partial<CreateCvDto>) {
    return this.cvService.update(id, payload);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    await this.cvService.remove(id);
  }

  @Patch(":id/rename")
  async rename(@Param("id") id: string, @Body("fullname") fullname: string) {
    return this.cvService.rename(id, fullname);
  }

  ////////////////////////////////////////////////////////////////////////////////
  @UseGuards(JwtAuthGuard)
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: "./uploads/cvs",
        filename: (req, file, cb) => {
          const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
          cb(null, unique + extname(file.originalname));
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.pdf$/i)) {
          return cb(new Error("Only PDF allowed!"), false);
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: ExRequest,
  ) {
    if (!file) {
      throw new HttpException("No file uploaded", 400);
    }

    try {
      // đọc file thành buffer để forward
      const fileBuffer = await fs.readFile(file.path);

      const payload = {
        originalname: file.originalname,
        buffer: fileBuffer,
        mimetype: file.mimetype,
      };

      // gọi fastapi
      const fastApiResponse = await this.cvService.uploadToFastApi(payload);

      // chuẩn bị metadata file (kèm path & filename & size)
      const fileMeta = {
        filename: file.filename,
        originalname: file.originalname,
        path: file.path,
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };

      // tạo CV từ response fastapi và lưu vào DB (và index)
      const userId = (req.user as any).userId as string;
      const { saved, raw } = await this.cvService.createFromFastApiResponse(
        fastApiResponse,
        fileMeta,
        userId,
      );

      return {
        message: "Uploaded and created CV successfully",
        cv: saved,
        fastApiRaw: fastApiResponse,
        filename: file.filename,
        path: file.path,
      };
    } catch (e) {
      this.logger.error("Upload/forward/create error", e as any);
      throw new HttpException("Failed to upload/forward/create CV", 500);
    }
  }

  /**
   * Download / fetch local file path info (returns path on server) — secure this in prod!
   */
  @Get("local/:filename")
  async getLocal(@Param("filename") filename: string) {
    const dir = process.env.LOCAL_CV_DIR || "./uploads/cvs";
    const p = join(dir, filename);
    if (!fsSync.existsSync(p)) {
      throw new HttpException("File not found", 404);
    }
    try {
      const st = await fs.stat(p);
      return { filename, path: p, size: st.size, mtime: st.mtime };
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      this.logger.error("Failed to stat local file", err as any);
      throw new HttpException("Failed to get file info", 500);
    }
  }

  /**
   * Delete a local saved file
   */
  @Delete("local/:filename")
  async deleteLocal(@Param("filename") filename: string) {
    const dir = process.env.LOCAL_CV_DIR || "./uploads/cvs";
    const p = join(dir, filename);
    if (!fsSync.existsSync(p)) {
      throw new HttpException("File not found", 404);
    }
    try {
      await fs.unlink(p);
      return { ok: true, filename };
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      this.logger.error("Failed delete local file", err as any);
      throw new HttpException("Failed to delete file", 500);
    }
  }

  @Get("file/:filename")
  async getFile(@Param("filename") filename: string, @Res() res: Response) {
    const baseDir = path.resolve(process.env.LOCAL_CV_DIR || "./uploads/cvs");

    // chống path traversal
    if (filename.includes("..") || path.isAbsolute(filename)) {
      throw new HttpException("Invalid filename", 400);
    }

    const filePath = path.join(baseDir, filename);

    if (!fsSync.existsSync(filePath)) {
      throw new HttpException("File not found", 404);
    }

    const mimeType = mimeLookup(filePath) || "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    return res.sendFile(filePath);
  }
}
