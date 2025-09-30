# Set env vars (edit with your real values)
$env:DATAONE_SFTP_HOST = "sftp.dataonesoftware.com"
$env:DATAONE_SFTP_PORT = "2222"
$env:DATAONE_SFTP_USER = "my_oil_sticker"
$env:DATAONE_SFTP_PASS = "1tXadHVaaAvKHeoz"

$env:DATAONE_REMOTE_DIR   = "/"
$env:DATAONE_DOWNLOAD_DIR = "$PSScriptRoot\..\ .dataone\incoming"
$env:DATAONE_EXTRACT_DIR  = "$PSScriptRoot\..\ .dataone\extracted"

$env:MONGODB_URI = "mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority"
$env:MONGODB_DB  = "mos-maintenance-mvp"

# Run (choose one)
npx ts-node "$PSScriptRoot\dataone-import.ts"
# node "$PSScriptRoot\dataone-import.js"
