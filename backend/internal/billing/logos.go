package billing

import (
	"bytes"
	_ "embed"
	"image"
	"image/color"
	"image/png"
)

// Official Nova wordmark from https://novaconsulting.com.br/ (white mark on gold).
//
//go:embed assets/nova-logo.jpg
var novaLogoJPG []byte

func nexusMarkPNG() []byte {
	const size = 256
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	n := color.RGBA{R: 0x6B, G: 0x6E, B: 0xF5, A: 255}
	e := color.RGBA{R: 0xF0, G: 0x62, B: 0xC8, A: 255}
	s := color.RGBA{R: 0x6B, G: 0x6E, B: 0xF5, A: 255}
	w := color.RGBA{R: 0x5C, G: 0x71, B: 0xFF, A: 255}
	fillTriangle(img, pt{128, 8}, pt{176, 80}, pt{80, 80}, n)
	fillTriangle(img, pt{248, 128}, pt{176, 80}, pt{176, 176}, e)
	fillTriangle(img, pt{128, 248}, pt{176, 176}, pt{80, 176}, s)
	fillTriangle(img, pt{8, 128}, pt{80, 80}, pt{80, 176}, w)
	return encodePNG(img)
}

type pt struct{ X, Y int }

func fillTriangle(img *image.RGBA, a, b, c pt, col color.RGBA) {
	minX := min3(a.X, b.X, c.X)
	maxX := max3(a.X, b.X, c.X)
	minY := min3(a.Y, b.Y, c.Y)
	maxY := max3(a.Y, b.Y, c.Y)
	bounds := img.Bounds()
	for y := minY; y <= maxY; y++ {
		for x := minX; x <= maxX; x++ {
			if !bounds.Overlaps(image.Rect(x, y, x+1, y+1)) {
				continue
			}
			if pointInTriangle(pt{x, y}, a, b, c) {
				img.SetRGBA(x, y, col)
			}
		}
	}
}

func pointInTriangle(p, a, b, c pt) bool {
	d1 := sign(p, a, b)
	d2 := sign(p, b, c)
	d3 := sign(p, c, a)
	neg := (d1 < 0) || (d2 < 0) || (d3 < 0)
	pos := (d1 > 0) || (d2 > 0) || (d3 > 0)
	return !(neg && pos)
}

func sign(p1, p2, p3 pt) int {
	return (p1.X-p3.X)*(p2.Y-p3.Y) - (p2.X-p3.X)*(p1.Y-p3.Y)
}

func min3(a, b, c int) int {
	if a <= b && a <= c {
		return a
	}
	if b <= c {
		return b
	}
	return c
}

func max3(a, b, c int) int {
	if a >= b && a >= c {
		return a
	}
	if b >= c {
		return b
	}
	return c
}

func encodePNG(img image.Image) []byte {
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}
