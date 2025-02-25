// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import "mocha";
import { expect } from "chai";
import sinon from "sinon";
import converter from "swagger2openapi";
import { SpecParser } from "../src/specParser";
import { ErrorType, ProjectType, ValidationStatus, WarningType } from "../src/interfaces";
import SwaggerParser from "@apidevtools/swagger-parser";
import { SpecParserError } from "../src/specParserError";
import { ConstantString } from "../src/constants";
import { OpenAPI, OpenAPIV3 } from "openapi-types";
import { SpecFilter } from "../src/specFilter";
import { ManifestUpdater } from "../src/manifestUpdater";
import { AdaptiveCardGenerator } from "../src/adaptiveCardGenerator";
import { Utils } from "../src/utils";
import jsyaml from "js-yaml";
import mockedEnv, { RestoreFn } from "mocked-env";
import { SMEValidator } from "../src/validators/smeValidator";
import { ValidatorFactory } from "../src/validators/validatorFactory";

describe("SpecParser", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("listSupportedAPIInfo", () => {
    it("should throw not implemented error", async () => {
      const specParser = new SpecParser("/path/to/spec.yaml");
      try {
        await specParser.listSupportedAPIInfo();
        expect.fail("Should throw not implemented error");
      } catch (error: any) {
        expect(error.message).to.equal("Method not implemented.");
      }
    });
  });

  describe("validate", () => {
    it("should return an error result when the spec is not valid", async () => {
      const specParser = new SpecParser("/path/to/spec.yaml");
      const spec = { openapi: "3.0.0" };
      sinon.stub(specParser.parser, "parse").resolves(spec as any);
      sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const parseStub = sinon
        .stub(specParser.parser, "validate")
        .rejects(new Error("Invalid spec"));

      const result = await specParser.validate();

      expect(result.status).to.equal(ValidationStatus.Error);
      expect(result.warnings).to.be.an("array").that.is.empty;
      expect(result.errors).to.be.an("array").that.has.lengthOf(1);
      expect(result.errors[0].type).to.equal(ErrorType.SpecNotValid);
      expect(result.errors[0].content).to.equal("Error: Invalid spec");
      sinon.assert.calledOnce(parseStub);
    });

    it("should return an warning result object if the spec version is 2.0", async function () {
      const specPath = "path/to/spec";
      const spec = {
        swagger: "2.0",
        info: {
          version: "1.0.0",
          title: "Swagger Petstore",
          description:
            "A sample API that uses a petstore as an example to demonstrate features in the swagger-2.0 specification",
        },
        host: "petstore.swagger.io",
        basePath: "/v2",
        schemes: ["https"],
        paths: {
          "/pet": {
            post: {
              summary: "Add a new pet to the store",
              operationId: "addPet",
              consumes: ["application/json"],
              produces: ["application/json"],
              parameters: [
                {
                  in: "body",
                  name: "body",
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      id: {
                        type: "integer",
                        format: "int64",
                      },
                      name: {
                        type: "string",
                      },
                    },
                  },
                },
              ],
              responses: {
                "200": {
                  description: "Pet added to the store",
                  schema: {
                    type: "object",
                    required: ["id", "name"],
                    properties: {
                      id: {
                        type: "integer",
                        format: "int64",
                      },
                      name: {
                        type: "string",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const specParser = new SpecParser(specPath);

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);

      const openapiSpecObj = await converter.convert(spec as any, {});
      const dereferenceStub = sinon
        .stub(specParser.parser, "dereference")
        .resolves(openapiSpecObj.openapi);
      const validateStub = sinon
        .stub(specParser.parser, "validate")
        .resolves(openapiSpecObj.openapi);

      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Warning,
        errors: [],
        warnings: [
          {
            type: WarningType.ConvertSwaggerToOpenAPI,
            content: ConstantString.ConvertSwaggerToOpenAPI,
          },
        ],
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return error object if the spec version is 2.0 with allowSwagger is false", async function () {
      const specPath = "path/to/spec";
      const spec = {
        swagger: "2.0",
        info: {
          version: "1.0.0",
          title: "Swagger Petstore",
          description:
            "A sample API that uses a petstore as an example to demonstrate features in the swagger-2.0 specification",
        },
        host: "petstore.swagger.io",
        basePath: "/v2",
        schemes: ["https"],
        paths: {
          "/pet": {
            post: {
              summary: "Add a new pet to the store",
              operationId: "addPet",
              consumes: ["application/json"],
              produces: ["application/json"],
              parameters: [
                {
                  in: "body",
                  name: "body",
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      id: {
                        type: "integer",
                        format: "int64",
                      },
                      name: {
                        type: "string",
                      },
                    },
                  },
                },
              ],
              responses: {
                "200": {
                  description: "Pet added to the store",
                  schema: {
                    type: "object",
                    required: ["id", "name"],
                    properties: {
                      id: {
                        type: "integer",
                        format: "int64",
                      },
                      name: {
                        type: "string",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const specParser = new SpecParser(specPath, { allowSwagger: false });

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);

      const openapiSpecObj = await converter.convert(spec as any, {});
      const dereferenceStub = sinon
        .stub(specParser.parser, "dereference")
        .resolves(openapiSpecObj.openapi);
      const validateStub = sinon
        .stub(specParser.parser, "validate")
        .resolves(openapiSpecObj.openapi);

      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Error,
        errors: [
          {
            type: ErrorType.SwaggerNotSupported,
            content: ConstantString.SwaggerNotSupported,
          },
        ],
        warnings: [],
      });
    });

    it("should return an error result object if no server information", async function () {
      const specPath = "path/to/spec";
      const spec = { openapi: "3.0.0" };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Error,
        warnings: [],
        errors: [
          { type: ErrorType.NoServerInformation, content: ConstantString.NoServerInformation },
          { type: ErrorType.NoSupportedApi, content: ConstantString.NoSupportedApi, data: [] },
        ],
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return an error result object if server url is http", async function () {
      const specPath = "path/to/spec";
      const spec = { openapi: "3.0.0", servers: [{ url: "http://server1" }] };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Error,
        warnings: [],
        errors: [
          {
            type: ErrorType.UrlProtocolNotSupported,
            content: Utils.format(ConstantString.UrlProtocolNotSupported, "http"),
            data: "http",
          },
          { type: ErrorType.NoSupportedApi, content: ConstantString.NoSupportedApi, data: [] },
        ],
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return an error result object if server url is relative path", async function () {
      const specPath = "path/to/spec";
      const spec = { openapi: "3.0.0", servers: [{ url: "path/to/server1" }] };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Error,
        warnings: [],
        errors: [
          {
            type: ErrorType.RelativeServerUrlNotSupported,
            content: ConstantString.RelativeServerUrlNotSupported,
            data: [
              {
                url: "path/to/server1",
              },
            ],
          },
          { type: ErrorType.NoSupportedApi, content: ConstantString.NoSupportedApi, data: [] },
        ],
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return an error result object if no supported apis", async function () {
      const specPath = "path/to/spec";
      const spec = { openapi: "3.0.0", servers: [{ url: "https://server1" }] };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Error,
        warnings: [],
        errors: [
          { type: ErrorType.NoSupportedApi, content: ConstantString.NoSupportedApi, data: [] },
        ],
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return an error result object if contain remote reference", async function () {
      const spec = {
        openapi: "3.0.3",
        info: {
          title: "Swagger Petstore - OpenAPI 3.",
          version: "1.0.11",
        },
        servers: [
          {
            url: "https://petstore3.swagger.io/api/v3",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "updatePet",
              responses: {
                "200": {
                  description: "Successful operation",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "https://petstore3.swagger.io/api/v3/openapi.json#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Pet: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  example: "doggie",
                },
              },
            },
          },
        },
      } as OpenAPIV3.Document;
      const specPath = "path/to/spec";
      const specParser = new SpecParser(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result.errors[0].type).equal(ErrorType.RemoteRefNotSupported);
      expect(result.status).equal(ValidationStatus.Error);
    });

    it("should return an warning result object if missing operation id", async function () {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://servers1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Warning,
        warnings: [
          {
            type: WarningType.OperationIdMissing,
            content: Utils.format(ConstantString.MissingOperationId, "GET /pet"),
            data: ["GET /pet"],
          },
        ],
        errors: [],
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return no supported API error with invalid api info", async function () {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://servers1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath, { allowMissingId: false });
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Error,
        warnings: [],
        errors: [
          {
            type: ErrorType.NoSupportedApi,
            content: ConstantString.NoSupportedApi,
            data: [
              {
                api: "GET /pet",
                reason: [ErrorType.MissingOperationId],
              },
            ],
          },
        ],
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return a valid result when the spec is valid", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();
      expect(result.status).to.equal(ValidationStatus.Valid);
      expect(result.warnings).to.be.an("array").that.is.empty;
      expect(result.errors).to.be.an("array").that.is.empty;
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return a valid result when the spec is valid for copilot", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath, { projectType: ProjectType.Copilot });
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();
      expect(result.status).to.equal(ValidationStatus.Valid);
      expect(result.warnings).to.be.an("array").that.is.empty;
      expect(result.errors).to.be.an("array").that.is.empty;
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return a valid result if one api contains circular reference", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        info: {
          title: "Pet Service",
          version: "1.0.0",
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        components: {
          schemas: {
            Circular: {
              type: "object",
              properties: {
                item: {
                  $ref: "#/components/schemas/Circular",
                },
              },
            },
            Pet: {
              type: "object",
              properties: {
                item: {
                  type: "string",
                },
              },
            },
          },
        },
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  description: "getPet",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
            post: {
              tags: ["pet"],
              operationId: "postPet",
              summary: "Post pet information from the store",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/Circular",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "postPet",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(spec as any, { projectType: ProjectType.Copilot });
      const result = await specParser.validate();
      expect(result.status).to.equal(ValidationStatus.Valid);
      expect(result.warnings).to.be.an("array").that.is.empty;
      expect(result.errors).to.be.an("array").that.is.empty;
    });

    it("should only create validator once if already created", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath, { projectType: ProjectType.Copilot });
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const createValidatorSpy = sinon.spy(ValidatorFactory, "create");
      const result1 = await specParser.validate();
      const result2 = await specParser.validate();
      sinon.assert.calledOnce(createValidatorSpy);
    });

    it("should return error result is project type is SME/Copilot, and OpenAPI spec version >= 3.1.0", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.1.0",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();
      expect(result.errors[0].type).equal(ErrorType.SpecVersionNotSupported);
      expect(result.errors[0].content).equal(
        Utils.format(ConstantString.SpecVersionNotSupported, "3.1.0")
      );
      expect(result.errors[0].data).equal("3.1.0");
      expect(result.status).equal(ValidationStatus.Error);

      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return valid result is project type is Teams Ai, and OpenAPI spec version >= 3.1.0", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.1.0",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath, { projectType: ProjectType.TeamsAi });
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();
      expect(result.status).to.equal(ValidationStatus.Valid);
      expect(result.warnings).to.be.an("array").that.is.empty;
      expect(result.errors).to.be.an("array").that.is.empty;
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should throw a SpecParserError when an error occurs", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/xml": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      try {
        const specParser = new SpecParser(specPath);
        const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
        sinon.stub(SMEValidator.prototype, "validateSpec").throws(new Error("validateSpec error"));

        const result = await specParser.validate();
        expect.fail("Expected SpecParserError to be thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(SpecParserError);
        expect(err.errorType).to.equal(ErrorType.ValidateFailed);
        expect(err.message).to.equal("Error: validateSpec error");
      }
    });
  });

  describe("generateForCopilot", () => {
    it("should throw an error if the signal is aborted", async () => {
      const manifestPath = "path/to/manifest";
      const filter = ["GET /pet/{petId}"];
      const specPath = "path/to/spec";
      const signal = { aborted: true } as AbortSignal;
      const specParser = new SpecParser("/path/to/spec.yaml");
      const pluginFilePath = "ai-plugin.json";

      try {
        await specParser.generateForCopilot(manifestPath, filter, specPath, pluginFilePath, signal);
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after loadSpec", async () => {
      const manifestPath = "path/to/manifest";
      const filter = ["GET /pet/{petId}"];
      const specPath = "path/to/spec";
      const adaptiveCardFolder = "path/to/adaptiveCardFolder";
      const pluginFilePath = "ai-plugin.json";

      try {
        const signal = { aborted: false } as any;

        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = { openapi: "3.0.0", paths: {} };

        const parseStub = sinon.stub(specParser as any, "loadSpec").callsFake(async () => {
          signal.aborted = true;
          return Promise.resolve();
        });
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        await specParser.generateForCopilot(manifestPath, filter, specPath, pluginFilePath, signal);
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after specFilter", async () => {
      try {
        const signal = { aborted: false } as any;

        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = { openapi: "3.0.0", paths: {} };
        const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        const specFilterStub = sinon
          .stub(SpecFilter, "specFilter")
          .callsFake((filter: string[], unResolveSpec: any) => {
            signal.aborted = true;
            return {} as any;
          });
        const outputFileStub = sinon.stub(fs, "outputFile").resolves();
        const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
        const JsyamlSpy = sinon.spy(jsyaml, "dump");
        const pluginFilePath = "ai-plugin.json";

        const filter = ["get /hello"];

        const outputSpecPath = "path/to/output.yaml";

        await specParser.generateForCopilot(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          pluginFilePath,
          signal
        );

        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after specFilter", async () => {
      try {
        const signal = { aborted: false } as any;

        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = { openapi: "3.0.0", paths: {} };
        const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        const specFilterStub = sinon.stub(SpecFilter, "specFilter").resolves();
        const outputFileStub = sinon.stub(fs, "outputFile").resolves();
        const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();

        const JsyamlSpy = sinon.stub(jsyaml, "dump").callsFake((obj) => {
          signal.aborted = true;
          return {} as any;
        });

        const filter = ["get /hello"];

        const outputSpecPath = "path/to/output.yaml";
        const pluginFilePath = "ai-plugin.json";

        await specParser.generateForCopilot(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          pluginFilePath,
          signal
        );

        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should generate a new spec and write it to a yaml file if spec contains api", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const updateManifestWithAiPluginStub = sinon
        .stub(ManifestUpdater, "updateManifestWithAiPlugin")
        .resolves([{}, {}, []] as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const pluginFilePath = "ai-plugin.json";
      const result = await specParser.generateForCopilot(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        pluginFilePath
      );

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(updateManifestWithAiPluginStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledTwice).to.be.true;
    });

    it("should throw a SpecParserError if outputFile throws an error", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = { openapi: "3.0.0", paths: {} };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").resolves();
      const outputFileStub = sinon.stub(fs, "outputFile").throws(new Error("outputFile error"));
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JSONStringifySpy = sinon.spy(JSON, "stringify");
      const JsyamlSpy = sinon.spy(jsyaml, "dump");
      const manifestUpdaterStub = sinon.stub(ManifestUpdater, "updateManifest").resolves([] as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.json";
      const pluginFilePath = "ai-plugin.json";

      try {
        await specParser.generateForCopilot(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          pluginFilePath
        );
        expect.fail("Expected generate to throw a SpecParserError");
      } catch (err: any) {
        expect(err).to.be.instanceOf(SpecParserError);
        expect(err.errorType).to.equal(ErrorType.GenerateFailed);
        expect(err.message).to.equal("Error: outputFile error");
      }
    });
  });

  describe("generate", () => {
    it("should throw an error if the signal is aborted", async () => {
      const manifestPath = "path/to/manifest";
      const filter = ["GET /pet/{petId}"];
      const specPath = "path/to/spec";
      const adaptiveCardFolder = "path/to/adaptiveCardFolder";
      const signal = { aborted: true } as AbortSignal;
      const parser = new SpecParser("/path/to/spec.yaml");

      try {
        await parser.generate(manifestPath, filter, specPath, adaptiveCardFolder, signal);
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after loadSpec", async () => {
      const manifestPath = "path/to/manifest";
      const filter = ["GET /pet/{petId}"];
      const specPath = "path/to/spec";
      const adaptiveCardFolder = "path/to/adaptiveCardFolder";
      try {
        const signal = { aborted: false } as any;

        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = { openapi: "3.0.0", paths: {} };

        const parseStub = sinon.stub(specParser as any, "loadSpec").callsFake(async () => {
          signal.aborted = true;
          return Promise.resolve();
        });
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        await specParser.generate(manifestPath, filter, specPath, adaptiveCardFolder, signal);
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after specFilter", async () => {
      try {
        const signal = { aborted: false } as any;

        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = { openapi: "3.0.0", paths: {} };
        const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        const specFilterStub = sinon
          .stub(SpecFilter, "specFilter")
          .callsFake((filter: string[], unResolveSpec: any) => {
            signal.aborted = true;
            return {} as any;
          });
        const outputFileStub = sinon.stub(fs, "outputFile").resolves();
        const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
        const JsyamlSpy = sinon.spy(jsyaml, "dump");

        const filter = ["get /hello"];

        const outputSpecPath = "path/to/output.yaml";
        await specParser.generate(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          "path/to/adaptiveCardFolder",
          signal
        );
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after generateAdaptiveCard", async () => {
      try {
        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = {
          openapi: "3.0.0",
          paths: {
            "/hello": {
              get: {
                responses: {
                  200: {
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            name: {
                              type: "string",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        };
        const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
        const outputFileStub = sinon.stub(fs, "outputFile").resolves();
        const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
        const JsyamlSpy = sinon.spy(jsyaml, "dump");
        const signal = { aborted: false } as any;

        const manifestUpdaterStub = sinon
          .stub(ManifestUpdater, "updateManifest")
          .resolves({} as any);

        const generateAdaptiveCardStub = sinon
          .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
          .callsFake((operationItem: OpenAPIV3.OperationObject) => {
            signal.aborted = true;
            return {} as any;
          });

        const filter = ["get /hello"];

        const outputSpecPath = "path/to/output.yaml";
        await specParser.generate(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          "path/to/adaptiveCardFolder",
          signal
        );
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should generate a new spec and write it to a yaml file if spec is empty", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = { openapi: "3.0.0", paths: {} };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([] as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      await specParser.generate(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        "path/to/adaptiveCardFolder"
      );

      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
    });

    it("should generate a new spec and write it to a yaml file if spec contains api", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
        ]);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        "path/to/adaptiveCardFolder"
      );

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledThrice).to.be.true;
    });

    it("should works fine if paths object contains description", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            description: "additional description",
            get: {
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
        ]);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        "path/to/adaptiveCardFolder"
      );

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledThrice).to.be.true;
    });

    it("should works fine if paths object contains description for teams ai project", async () => {
      const specParser = new SpecParser("path/to/spec.yaml", { projectType: ProjectType.TeamsAi });
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            description: "additional description",
            get: {
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
        ]);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate("path/to/manifest.json", filter, outputSpecPath);

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledOnce).to.be.true;
      expect(generateAdaptiveCardStub.notCalled).to.be.true;
    });

    it("should throw error if contain multiple API key in spec", async () => {
      const specParser = new SpecParser("path/to/spec.yaml", { allowAPIKeyAuth: true });
      const spec = {
        openapi: "3.0.0",
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
            api_key2: {
              type: "apiKey",
              name: "api_key2",
              in: "header",
            },
          },
        },
        paths: {
          "/hello": {
            get: {
              operationId: "getHello",
              security: [
                {
                  api_key: [],
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              security: [
                {
                  api_key2: [],
                },
              ],
              operationId: "postHello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
        ]);

      const filter = ["get /hello", "post /hello"];

      const outputSpecPath = "path/to/output.yaml";
      try {
        await specParser.generate(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          "path/to/adaptiveCardFolder"
        );
        expect.fail("Expected generate to throw a SpecParserError");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.MultipleAuthNotSupported);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.MultipleAuthNotSupported);
      }
    });

    it("should work if two api contains same auth", async () => {
      const specParser = new SpecParser("path/to/spec.yaml", { allowAPIKeyAuth: true });
      const spec = {
        openapi: "3.0.0",
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
          },
        },
        paths: {
          "/hello": {
            get: {
              operationId: "getHello",
              security: [
                {
                  api_key: [],
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              security: [
                {
                  api_key: [],
                },
              ],
              operationId: "postHello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
        ]);

      const filter = ["get /hello", "post /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate("path/to/manifest.json", filter, outputSpecPath);
      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledOnce).to.be.true;
      expect(generateAdaptiveCardStub.notCalled).to.be.true;
    });

    it("should work if contain multiple API key in spec when project Type is teams ai", async () => {
      const specParser = new SpecParser("path/to/spec.yaml", {
        allowAPIKeyAuth: true,
        projectType: ProjectType.TeamsAi,
      });
      const spec = {
        openapi: "3.0.0",
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
            api_key2: {
              type: "apiKey",
              name: "api_key2",
              in: "header",
            },
          },
        },
        paths: {
          "/hello": {
            get: {
              operationId: "getHello",
              security: [
                {
                  api_key: [],
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              security: [
                {
                  api_key2: [],
                },
              ],
              operationId: "postHello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
        ]);

      const filter = ["get /hello", "post /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate("path/to/manifest.json", filter, outputSpecPath);

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledOnce).to.be.true;
      expect(generateAdaptiveCardStub.notCalled).to.be.true;
    });

    it("should contain warnings if generate adaptive card failed", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const cloneSpec = JSON.parse(JSON.stringify(spec));
      cloneSpec.paths["/hello"].get.operationId = "getHello";
      const dereferenceStub = sinon
        .stub(specParser.parser, "dereference")
        .resolves(cloneSpec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .throws(new Error("generate adaptive card failed"));

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        "path/to/adaptiveCardFolder"
      );

      expect(result.allSuccess).to.be.false;
      expect(result.warnings).to.deep.equal([
        {
          type: WarningType.GenerateCardFailed,
          content: "Error: generate adaptive card failed",
          data: "getHello",
        },
      ]);

      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
    });

    it("should throw a SpecParserError if outputFile throws an error", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = { openapi: "3.0.0", paths: {} };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").resolves();
      const outputFileStub = sinon.stub(fs, "outputFile").throws(new Error("outputFile error"));
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JSONStringifySpy = sinon.spy(JSON, "stringify");
      const JsyamlSpy = sinon.spy(jsyaml, "dump");
      const manifestUpdaterStub = sinon.stub(ManifestUpdater, "updateManifest").resolves([] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns({} as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.json";

      try {
        await specParser.generate(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          "path/to/adaptiveCardFolder"
        );
        expect.fail("Expected generate to throw a SpecParserError");
      } catch (err: any) {
        expect(err).to.be.instanceOf(SpecParserError);
        expect(err.errorType).to.equal(ErrorType.GenerateFailed);
        expect(err.message).to.equal("Error: outputFile error");
      }
    });

    it("should throw a SpecParserError if specFilter throws a SpecParserError", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = { openapi: "3.0.0", paths: {} };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon
        .stub(SpecFilter, "specFilter")
        .throws(new SpecParserError("specFilter error", ErrorType.FilterSpecFailed));
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JSONStringifySpy = sinon.spy(JSON, "stringify");
      const JsyamlSpy = sinon.spy(jsyaml, "dump");
      const manifestUpdaterStub = sinon.stub(ManifestUpdater, "updateManifest").resolves();
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns({} as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.json";

      try {
        await specParser.generate(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          "path/to/adaptiveCardFolder"
        );
        expect.fail("Expected generate to throw a SpecParserError");
      } catch (err: any) {
        expect(err).to.be.instanceOf(SpecParserError);
        expect(err.errorType).to.equal(ErrorType.FilterSpecFailed);
        expect(err.message).to.equal("specFilter error");
      }
    });
  });

  describe("list", () => {
    let envRestore: RestoreFn | undefined;
    afterEach(() => {
      if (envRestore) {
        envRestore();
        envRestore = undefined;
      }
    });

    it("should return a list of HTTP methods and paths for all GET with 1 parameter and without security", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath);
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
        ],
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
          },
        },
        paths: {
          "/pets": {
            get: {
              operationId: "getPetById",
              security: [{ api_key: [] }],
            },
          },
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: "createUser",
              security: [{ api_key: [] }],
            },
          },
          "/store/order": {
            post: {
              operationId: "placeOrder",
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /pets",
            server: "",
            operationId: "getPetById",
            reason: ["auth-type-is-not-supported", "response-json-is-empty", "no-parameter"],
            isValid: false,
          },
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            operationId: "getUserById",
            isValid: true,
            reason: [],
          },
          {
            api: "POST /user/{userId}",
            server: "",
            operationId: "createUser",
            reason: ["auth-type-is-not-supported", "response-json-is-empty", "no-parameter"],
            isValid: false,
          },
          {
            api: "POST /store/order",
            server: "",
            operationId: "placeOrder",
            reason: ["response-json-is-empty", "no-parameter"],
            isValid: false,
          },
        ],
        allAPICount: 4,
        validAPICount: 1,
      });
    });

    it("should generate an operationId if not exist", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath);
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            operationId: "getUserUserId",
            isValid: true,
            reason: [],
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });

    it("should return correct server information", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowAPIKeyAuth: true });
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
          {
            url: "https://server2",
          },
        ],
        paths: {
          "/user/{userId}": {
            servers: [
              {
                url: "https://server3",
              },
              {
                url: "https://server4",
              },
            ],
            get: {
              servers: [
                {
                  url: "https://server5",
                },
                {
                  url: "https://server6",
                },
              ],
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server5",
            operationId: "getUserById",
            isValid: true,
            reason: [],
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });

    it("should return a list of HTTP methods and paths for all GET with 1 parameter and api key auth security", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowAPIKeyAuth: true });
      const spec = {
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
          },
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              security: [{ api_key: [] }],
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: { type: "apiKey", name: "api_key", in: "header" },
              name: "api_key",
            },
            operationId: "getUserById",
            isValid: true,
            reason: [],
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });

    it("should return a list of HTTP methods and paths for all GET with 1 parameter and bearer token auth security", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowBearerTokenAuth: true });
      const spec = {
        components: {
          securitySchemes: {
            bearerTokenAuth: {
              type: "http",
              scheme: "bearer",
            },
          },
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              security: [{ bearerTokenAuth: [] }],
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();
      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "http",
                scheme: "bearer",
              },
              name: "bearerTokenAuth",
            },
            operationId: "getUserById",
            isValid: true,
            reason: [],
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });

    it("should return correct auth information", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowAPIKeyAuth: true });
      const spec = {
        components: {
          securitySchemes: {
            aad_auth: {
              type: "oauth2",
              flows: {
                implicit: {
                  authorizationUrl: "https://authorize",
                  scopes: {
                    "write:pets": "modify pets in your account",
                    "read:pets": "read your pets",
                  },
                },
              },
            },
            api_key1: {
              type: "apiKey",
              name: "api_key1",
              in: "header",
            },
            api_key2: {
              type: "apiKey",
              name: "api_key2",
              in: "header",
            },
          },
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              security: [
                { api_key1: [], api_key2: [], aad_auth: ["write:pets"] },
                { api_key2: [], api_key1: [], aad_auth: ["write:pets"] },
                { api_key1: [] },
                { api_key2: [] },
              ],
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              security: [
                { api_key1: [], api_key2: [], aad_auth: ["write:pets"] },
                { api_key2: [], api_key1: [], aad_auth: ["write:pets"] },
                { api_key2: [] },
                { api_key1: [] },
              ],
              operationId: "postUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "apiKey",
                name: "api_key1",
                in: "header",
              },
              name: "api_key1",
            },
            operationId: "getUserById",
            isValid: true,
            reason: [],
          },
          {
            api: "POST /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "apiKey",
                name: "api_key1",
                in: "header",
              },
              name: "api_key1",
            },
            operationId: "postUserById",
            isValid: true,
            reason: [],
          },
        ],
        allAPICount: 2,
        validAPICount: 2,
      });
    });

    it("should return correct auth information when auth is in the spec root", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowAPIKeyAuth: true });
      const spec = {
        components: {
          securitySchemes: {
            aad_auth: {
              type: "oauth2",
              flows: {
                implicit: {
                  authorizationUrl: "https://authorize",
                  scopes: {
                    "write:pets": "modify pets in your account",
                    "read:pets": "read your pets",
                  },
                },
              },
            },
            api_key1: {
              type: "apiKey",
              name: "api_key1",
              in: "header",
            },
            api_key2: {
              type: "apiKey",
              name: "api_key2",
              in: "header",
            },
          },
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        security: [
          { api_key1: [], api_key2: [], aad_auth: ["write:pets"] },
          { api_key2: [], api_key1: [], aad_auth: ["write:pets"] },
          { api_key1: [] },
          { api_key2: [] },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: "postUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "apiKey",
                name: "api_key1",
                in: "header",
              },
              name: "api_key1",
            },
            operationId: "getUserById",
            isValid: true,
            reason: [],
          },
          {
            api: "POST /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "apiKey",
                name: "api_key1",
                in: "header",
              },
              name: "api_key1",
            },
            operationId: "postUserById",
            isValid: true,
            reason: [],
          },
        ],
        allAPICount: 2,
        validAPICount: 2,
      });
    });

    it("should allow multiple parameters if allowMultipleParameters is true", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowMultipleParameters: true });
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                  required: true,
                },
                {
                  name: "name",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                  required: true,
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            operationId: "getUserById",
            isValid: true,
            reason: [],
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });

    it("should not list api without operationId with allowMissingId is false", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowMissingId: false });
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "",
            operationId: "getUserUserId",
            isValid: false,
            reason: ["missing-operation-id"],
          },
        ],
        allAPICount: 1,
        validAPICount: 0,
      });
    });

    it("should throw an error when the SwaggerParser library throws an error", async () => {
      const specPath = "invalid-spec.yaml";
      const specParser = new SpecParser(specPath);
      sinon.stub(SwaggerParser, "validate").rejects(new Error("Invalid specification"));
      const parseStub = sinon
        .stub(specParser.parser, "parse")
        .rejects(new Error("Invalid specification"));
      try {
        await specParser.list();
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain("Invalid specification");
        expect((err as SpecParserError).errorType).to.equal(ErrorType.ListFailed);
      }
    });

    it("should throw an error when the spec doesn't contain server information", async () => {
      const specPath = "valid-spec.yaml";
      const spec = {
        paths: {
          "/pets": {
            get: {
              operationId: "getPetById",
              security: [{ api_key: [] }],
            },
          },
          "/user/{userId}": {
            get: {
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /pets",
            server: "",
            operationId: "getPetById",
            isValid: false,
            reason: ["no-server-information", "response-json-is-empty", "no-parameter"],
          },
          {
            api: "GET /user/{userId}",
            server: "",
            operationId: "getUserUserId",
            isValid: false,
            reason: ["no-server-information"],
          },
        ],
        allAPICount: 2,
        validAPICount: 0,
      });
    });

    it("should return correct domain when domain contains placeholder", async () => {
      envRestore = mockedEnv({
        ["SERVER_ENV"]: "https://server1",
      });
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowAPIKeyAuth: true });
      const spec = {
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
          },
        },
        servers: [
          {
            url: "${{SERVER_ENV}}",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              security: [{ api_key: [] }],
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon
        .stub(specParser.parser, "dereference")
        .callsFake(async (api: string | OpenAPI.Document) => {
          expect((api as OpenAPIV3.Document).servers![0].url == "https://server1");
          return api as any;
        });

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "apiKey",
                name: "api_key",
                in: "header",
              },
              name: "api_key",
            },
            operationId: "getUserById",
            isValid: true,
            reason: [],
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });
  });

  describe("getFilteredSpecs", () => {
    it("should throw an error if failed to parse the spec", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = { openapi: "3.0.0", paths: {} };
      const parseStub = sinon.stub(specParser.parser, "parse").throws(new Error("parse error"));
      const filter = ["get /hello"];
      try {
        await specParser.getFilteredSpecs(filter);
        expect.fail("Expected generate to throw a SpecParserError");
      } catch (err: any) {
        expect(err).to.be.instanceOf(SpecParserError);
        expect(err.errorType).to.equal(ErrorType.GetSpecFailed);
        expect(err.message).to.equal("Error: parse error");
      }
    });

    it("should works fine when filter spec", async () => {
      const spec = {
        openapi: "3.0.2",
        info: {
          title: "User Service",
          version: "1.0.0",
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  description: "test",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: "postUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  description: "test",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            User: {
              type: "object",
            },
          },
        },
      };
      const specParser = new SpecParser(spec as any);

      const filter = ["get /user/{userId}"];
      const result = await specParser.getFilteredSpecs(filter);
      expect(result[0]).to.deep.equal({
        openapi: "3.0.2",
        info: {
          title: "User Service",
          version: "1.0.0",
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  description: "test",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            User: {
              type: "object",
            },
          },
        },
      });
      expect(result[1]).to.deep.equal({
        openapi: "3.0.2",
        info: {
          title: "User Service",
          version: "1.0.0",
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  description: "test",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            User: {
              type: "object",
            },
          },
        },
      });
    });
  });
});
