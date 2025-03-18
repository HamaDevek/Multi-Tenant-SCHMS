const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = err.message;
  } else if (err.name === "UnauthorizedError" || err.message.includes("auth")) {
    statusCode = 401;
    message = "Unauthorized";
  } else if (err.code === "ER_DUP_ENTRY") {
    statusCode = 409;
    message = "Duplicate entry";
  }

  res.status(statusCode).json({
    status: "error",
    message,
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      details: err.details || null,
    }),
  });
};

module.exports = errorHandler;
