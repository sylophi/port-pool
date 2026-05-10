package cmd

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/sylophi/port-pool/internal/release"
)

const (
	minBinaryBytes  = 1_000_000
	metadataTimeout = 10 * time.Second
	downloadTimeout = 5 * time.Minute
)

func SelfUpdate(version string) error {
	if version == "dev" {
		return fmt.Errorf("cannot update a dev build. Either run from source, or install the released binary via curl-pipe.")
	}

	suffix, err := detectAssetSuffix()
	if err != nil {
		return err
	}

	fmt.Println("Checking for updates...")
	metaCtx, metaCancel := context.WithTimeout(context.Background(), metadataTimeout)
	defer metaCancel()
	tagName, err := release.FetchLatestTag(metaCtx)
	if err != nil {
		return fmt.Errorf("failed to fetch release info: %w", err)
	}

	if tagName == version {
		fmt.Printf("Already at latest version: %s\n", version)
		return nil
	}

	asset := release.AssetName(suffix)
	url := release.AssetURL(tagName, asset)
	fmt.Printf("Downloading %s for %s...\n", tagName, suffix)

	currentPath, err := os.Executable()
	if err != nil {
		return err
	}
	if resolved, err := filepath.EvalSymlinks(currentPath); err == nil {
		currentPath = resolved
	}
	tmpPath := currentPath + ".update"

	written, err := downloadTo(tmpPath, url)
	if err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if written < minBinaryBytes {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("downloaded file is suspiciously small (%d bytes); aborting", written)
	}

	if err := os.Rename(tmpPath, currentPath); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	fmt.Printf("Updated %s -> %s\n", version, tagName)
	return nil
}

// downloadTo streams url into path with mode 0o755, returning the number
// of bytes written. The caller is responsible for cleanup on error.
func downloadTo(path, url string) (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), downloadTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("download failed: HTTP %d for %s", resp.StatusCode, url)
	}

	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o755)
	if err != nil {
		return 0, err
	}
	n, copyErr := io.Copy(f, resp.Body)
	closeErr := f.Close()
	if copyErr != nil {
		return n, copyErr
	}
	if closeErr != nil {
		return n, closeErr
	}
	return n, nil
}

func detectAssetSuffix() (string, error) {
	var goos, arch string
	switch runtime.GOOS {
	case "darwin":
		goos = "darwin"
	case "linux":
		goos = "linux"
	default:
		return "", fmt.Errorf("unsupported platform: %s/%s", runtime.GOOS, runtime.GOARCH)
	}
	switch runtime.GOARCH {
	case "arm64":
		arch = "arm64"
	case "amd64":
		arch = "x64"
	default:
		return "", fmt.Errorf("unsupported platform: %s/%s", runtime.GOOS, runtime.GOARCH)
	}
	return goos + "-" + arch, nil
}
