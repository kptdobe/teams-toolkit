@page
@model {{SafeProjectName}}.Pages.ErrorModel

<!DOCTYPE html>
<html>

<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Error</title>
    <link href="~/css/bootstrap/bootstrap.min.css" rel="stylesheet" />
    <link href="~/css/app.css" rel="stylesheet" />
</head>

<body>
    <div class="main">
        <div class="content px-4">
            <h1 class="text-danger">Error.</h1>
            <h2 class="text-danger">An error occurred while processing your request.</h2>

            @if (Model.ShowRequestId)
            {
                <p>
                    <strong>Request ID:</strong> <code>@Model.RequestId</code>
                </p>
            }

            <h3>Development Mode</h3>
            <p>
                Swapping to the <strong>Development</strong> environment displays detailed information about the error that occurred.
            </p>
            <p>
                <strong>The Development environment shouldn't be enabled for deployed applications.</strong>
                It can result in displaying sensitive information from exceptions to end users.
                For local debugging, enable the <strong>Development</strong> environment by setting the <strong>ASPNETCORE_ENVIRONMENT</strong> environment variable to <strong>Development</strong>
                and restarting the app.
            </p>
        </div>
    </div>
</body>

</html>
